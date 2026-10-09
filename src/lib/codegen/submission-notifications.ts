import type { SemanticBackendService } from "@/types/backend";
import { serviceSlug } from "@/lib/project/schema";
import { emailWorkerSource } from "./auth-recovery";
import { databaseEnvironment } from "./database";

export function submissionNotificationFiles(
  service: SemanticBackendService,
): Record<string, string> {
  const configs = service.blocks
    .filter((b) => b.type === "submission_notification")
    .map((b) => {
      const c =
        b.config as import("@/lib/backend/submission-notification-schema").SubmissionNotificationConfig;
      const model = service.blocks.find((m) => m.id === c.modelId)!;
      return {
        ...c,
        id: b.id,
        model: (model.config as import("@/types/backend").DbModelConfig)
          .tableName,
        inboxPath: `/__levoks/inbox/${serviceSlug(service.name)}/${c.inboxEndpointId}`,
      };
    });
  if (!configs.length) return {};
  return {
    "notifications/config.json": JSON.stringify(configs, null, 2),
    "notifications/.env.example":
      Object.entries({
        ...databaseEnvironment(service),
        NODE_ENV: "production",
        SUBMISSION_EMAIL_FROM: "",
        SUBMISSION_EMAIL_TO: "",
        SUBMISSION_PUBLIC_ORIGIN: "",
        RESEND_API_KEY: "",
      })
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
    "notifications/index.js": String.raw`
const crypto = require('node:crypto');
const configuration = require('./config.json');
const models = Object.fromEntries(configuration.map(c => [c.modelId, require('../models/' + c.model)]));
const field = '_levoksSubmissionMail';
const fail = message => Object.assign(new Error(message), {status: 503});
function settings() {
  const from = process.env.SUBMISSION_EMAIL_FROM || '', to = process.env.SUBMISSION_EMAIL_TO || '';
  if (from.length > 320 || to.length > 320 || /[\r\n\x00-\x1f\x7f]/.test(from + to) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) throw fail('Configure one sender and one recipient email address');
  let origin;
  try {origin = new URL(process.env.SUBMISSION_PUBLIC_ORIGIN); if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !['http:', 'https:'].includes(origin.protocol) || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw new Error();}
  catch {throw fail('Configure a secure frontend origin');}
  if (!process.env.RESEND_API_KEY) throw fail('Configure the email provider key on the worker');
  let endpoint = 'https://api.resend.com/emails';
  if (process.env.NODE_ENV === 'test') {
    try {const url = new URL(process.env.SUBMISSION_EMAIL_TEST_ENDPOINT); if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error(); endpoint = url.href;}
    catch {throw fail('Local tests require a loopback email transport');}
  }
  return {from, to, origin: origin.origin, endpoint};
}

exports.ready = settings;
exports.initialize = async () => {await Promise.all(Object.values(models).map(model => model.init()));};
exports.processOne = async () => {
  const options = settings();
  for (const config of configuration) {
    const model = models[config.modelId], now = new Date();
    const unlocked = {$or: [{[field + '.leaseUntil']: null}, {[field + '.leaseUntil']: {$lte: now}}]};
    await model.updateMany({[field + '.configId']: config.id, [field + '.status']: 'queued', [field + '.expiresAt']: {$lte: now}, ...unlocked}, {$set: {[field + '.status']: 'expired'}, $unset: {[field + '.lease']: '', [field + '.leaseUntil']: ''}});
    if (model.schema.path('deletedAt')) await model.updateMany({deletedAt: {$ne: null}, [field + '.configId']: config.id, [field + '.status']: 'queued', ...unlocked}, {$set: {[field + '.status']: 'cancelled'}});
    const lease = crypto.randomUUID();
    const row = await model.findOneAndUpdate({[field + '.configId']: config.id, [field + '.status']: 'queued', [field + '.dueAt']: {$lte: now}, [field + '.expiresAt']: {$gt: now}, ...unlocked, ...(model.schema.path('deletedAt') ? {deletedAt: null} : {})}, {$set: {[field + '.lease']: lease, [field + '.leaseUntil']: new Date(Date.now() + 60000)}}, {new: true}).select('+' + field).maxTimeMS(5000);
    if (!row) continue;
    const mail = row[field], filter = {_id: row._id, [field + '.id']: mail.id, [field + '.lease']: lease};
    const payload = {from: options.from, to: [options.to], subject: mail.subject, text: 'A new submission was saved. Sign in to your private inbox: ' + options.origin + mail.inboxPath + '\nSubmitted information is available only in the authenticated inbox.'};
    const fingerprint = crypto.createHash('sha256').update(mail.id + JSON.stringify(payload)).digest('hex');
    let retry = true, reason = 'transport', delay = 30000 * 2 ** mail.attempts;
    try {
      if (mail.fingerprint && mail.fingerprint !== fingerprint) {retry = false; reason = 'configuration_changed'; throw new Error();}
      const claimed = await model.updateOne(filter, {$set: {[field + '.fingerprint']: fingerprint}}).maxTimeMS(5000);
      if (claimed.matchedCount !== 1) return true;
      const response = await fetch(options.endpoint, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': mail.id}, body: JSON.stringify(payload)});
      if (!response.ok) {
        let detail; try {detail = await response.json();} catch {}
        retry = response.status === 429 || response.status >= 500 || response.status === 409 && detail?.name === 'concurrent_idempotent_requests';
        reason = retry ? 'provider_unavailable' : 'provider_rejected';
        const seconds = Number(response.headers.get('retry-after'));
        if (Number.isFinite(seconds) && seconds > 0) delay = Math.max(delay, Math.min(3600000, seconds * 1000));
        throw new Error();
      }
      await response.body?.cancel();
      await model.updateOne(filter, {$set: {[field + '.status']: 'sent', [field + '.sentAt']: new Date()}, $inc: {[field + '.attempts']: 1}, $unset: {[field + '.lease']: '', [field + '.leaseUntil']: '', [field + '.reason']: ''}});
    } catch {
      // ponytail: five attempts within 23 hours, inside the provider's 24-hour idempotency window; broader durable job administration is separate.
      const dueAt = new Date(Date.now() + delay);
      const again = retry && mail.attempts < 4 && dueAt < mail.expiresAt;
      await model.updateOne(filter, {$set: {[field + '.status']: again ? 'queued' : 'failed', [field + '.dueAt']: dueAt, [field + '.reason']: reason}, $inc: {[field + '.attempts']: 1}, $unset: {[field + '.lease']: '', [field + '.leaseUntil']: ''}});
    }
    return true;
  }
  return false;
};
exports.status = async () => {
  const counts = {};
  for (const config of configuration) {
    const rows = await models[config.modelId].aggregate([{$match: {[field + '.configId']: config.id}}, {$group: {_id: '$' + field + '.status', count: {$sum: 1}}}]).option({maxTimeMS: 5000});
    counts[config.id] = Object.fromEntries(rows.map(row => [row._id, row.count]));
  }
  return counts;
};
`.trim(),
    "workers/submission-email.js": emailWorkerSource(
      "../notifications",
      "Submission email",
      "notifications/.env",
    ),
    "scripts/notification-status.js":
      "require('dotenv').config();\nconst database = require('../database');\nconst notifications = require('../notifications');\ndatabase.connect().then(() => notifications.status()).then(counts => console.log(JSON.stringify(counts))).catch(() => {console.error('Notification status unavailable. Check the database connection.'); process.exitCode = 1;}).finally(() => database.disconnect());\n",
  };
}

export function submissionNotificationGuide(
  services: Pick<SemanticBackendService, "name">[],
) {
  return `# Submission email alerts

${services.map((s) => `- ${s.name}: run workers from backend/${serviceSlug(s.name)}. Compose variables use the prefix ${serviceSlug(s.name).replaceAll("-", "_").toUpperCase()}_.`).join("\n")}

Form → Content → Email alerts for new submissions adds an editable Submission Email configuration block. A submission and its hidden queued alert are saved in one atomic MongoDB document write. Failed saves create no jobs. The API never calls an email provider. Disabling alerts stops new jobs; existing jobs continue processing. Deploy updated code and restart workers when changing configuration.

For native execution, copy the service notifications/.env.example to notifications/.env to configure its separate worker environment. Set its database URL to the SAME database as the submission API, NODE_ENV=production, SUBMISSION_EMAIL_FROM to a verified plain sender address, SUBMISSION_EMAIL_TO to one operator recipient address, SUBMISSION_PUBLIC_ORIGIN to the HTTPS frontend origin (without a path), and RESEND_API_KEY. Keep addresses and the provider key outside project files and API/browser environments. From the service directory, run npm run worker:submissions with those environment variables. The worker loads notifications/.env; process environment variables take precedence. The API loads its own .env. Supervise the worker independently from npm start. Run npm run notifications:status with only its database environment to see queued/sent/failed/expired/cancelled counts without submission data.

For Compose, copy backend/.env.example to backend/.env and set the service-prefixed variables. Start API/database containers normally. After configuration, opt into workers with docker compose --profile notifications up -d --build. Worker containers have no published ports or JWT/setup tokens; provider settings are passed only to workers. Container execution and live-provider delivery require later deployment acceptance.

Messages contain only a generic notice and the authenticated inbox link, never submitted names, addresses or message contents. Queues store no recipient/provider key or submitted-payload copy. Subject and inbox path are snapshotted at save time. A salted payload fingerprint prevents changed sender/recipient/origin settings from modifying an already attempted idempotent request; such jobs fail with configuration_changed. Keep settings consistent across replicas/retries.

Workers lease jobs for 60 seconds, send with a 15-second timeout, and acknowledge only their own lease. Stable idempotency keys protect crash/restart retries. Temporary transport failures, 429, 5xx and concurrent-idempotent-request 409 responses retry with backoff. Permanent rejection and payload conflicts stop. At most five attempts occur within 23 hours; older jobs expire without deleting submissions. This stays within the provider's [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). Sent means provider accepted, not confirmed mailbox delivery. Soft-deleted records cancel queued alerts when not leased; in-flight mail cannot be recalled.

Do not manually replay expired/failed jobs with new keys: duplicates can result. General queue administration, delivery webhooks/bounces, multiple channels/recipients, preferences, visitor confirmations, relational/SQL collections and live-provider acceptance remain separate work. Local tests require NODE_ENV=test and a loopback SUBMISSION_EMAIL_TEST_ENDPOINT. Production ignores that test endpoint and requires HTTPS inbox links. Editor preview executes no backend sends.
`;
}
