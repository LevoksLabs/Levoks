import {
  auditLogSchema,
  errorHandlerSchema,
} from "@/lib/backend/observability-schema";
import type { ServiceContainer, EndpointConfig } from "@/types/backend";
export function observabilityRuntime(service: ServiceContainer) {
  const error = errorHandlerSchema.parse(
    service.blocks.find((b) => b.type === "error_handler")?.config || {},
  );
  const auditBlock = service.blocks.find((b) => b.type === "audit_log");
  const audit = auditBlock ? auditLogSchema.parse(auditBlock.config) : null;
  const endpoints = service.blocks
    .filter((b) => b.type === "rest_endpoint")
    .map((b) => ({ id: b.id, ...(b.config as EndpointConfig) }))
    .map(({ id, route, method }) => ({ id, route, method }));
  return `
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const errors = ${JSON.stringify(error)}, audit = ${JSON.stringify(audit)}, endpoints = ${JSON.stringify(endpoints)};
const requestLogging = ${JSON.stringify(service.blocks.some(b => b.type === 'middleware' && 'middlewareType' in b.config && b.config.middlewareType === 'logger'))};
const pending = new Set();
const collection = () => mongoose.connection.db.collection('levoks_audit');
const writeOptions = {maxTimeMS: 2000, writeConcern: {w: 'majority', wtimeoutMS: 2000}};
exports.initialize = async () => {if (audit) {await collection().createIndex({expiresAt: 1}, {expireAfterSeconds: 0}); await collection().createIndex({createdAt: -1});}};
function metadata(req) {return {requestId: req.levoksRequestId, method: req.method, endpointId: req.levoksEndpoint?.id || null};}
exports.context = (req, res, next) => {
  req.levoksRequestId = crypto.randomUUID();
  res.set('X-Request-Id', req.levoksRequestId);
  req.levoksEndpoint = endpoints.find(e => e.method === req.method && e.route.split('/').length === req.path.split('/').length && e.route.split('/').every((s, i) => s.startsWith(':') || s === req.path.split('/')[i]));
  if (requestLogging) {const started = performance.now(); res.once('finish', () => console.log(JSON.stringify({event: 'request.completed', ...metadata(req), status: res.statusCode, durationMs: Math.round(performance.now() - started)})));}
  next();
};
exports.audit = async (req, res, next) => {
  if (!audit || !req.levoksEndpoint || (!audit.includeReads && ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) || (audit.endpointIds.length && !audit.endpointIds.includes(req.levoksEndpoint.id))) return next();
  const now = new Date(), id = req.levoksRequestId, started = performance.now();
  try {
    if (mongoose.connection.readyState !== 1) throw new Error();
    await collection().insertOne({_id: id, ...metadata(req), event: audit.event, phase: 'started', createdAt: now, expiresAt: new Date(now.getTime() + audit.retentionDays * 86400000)}, writeOptions);
  } catch {
    console.error(JSON.stringify({event: 'audit.unavailable', ...metadata(req)}));
    if (audit.failClosed) return next(Object.assign(new Error(), {status: 503}));
    return next();
  }
  let completed = false;
  const finish = phase => {
    if (completed) return; completed = true;
    const context = {phase, status: res.statusCode, durationMs: Math.round(performance.now() - started), completedAt: new Date(), ...(audit.recordActor && typeof req.user?.sub === 'string' ? {actorId: req.user.sub.slice(0, 120)} : {}), ...(audit.recordTenant && typeof req.user?.tenantId === 'string' ? {tenantId: req.user.tenantId.slice(0, 120)} : {})};
    // The durable start record remains if a process dies before completion. Never
    // report such an event as completed or claim it is an atomic business audit.
    const task = collection().updateOne({_id: id, phase: 'started'}, {$set: context}, writeOptions).catch(() => console.error(JSON.stringify({event: 'audit.completion_unavailable', requestId: id}))).finally(() => pending.delete(task));
    pending.add(task);
  };
  res.once('finish', () => finish('completed'));
  res.once('close', () => finish(res.writableFinished ? 'completed' : 'aborted'));
  next();
};
exports.flush = async () => {await Promise.allSettled([...pending]);};
exports.transaction = async (req, endpointId, blockId, session) => {
  const endpoint = endpoints.find(e => e.id === endpointId);
  if (!audit?.transactionEvents || !endpoint || (audit.endpointIds.length && !audit.endpointIds.includes(endpointId)) || (!audit.includeReads && endpoint.method === 'GET')) return;
  const now = new Date();
  // This insert uses the exact session containing the business writes. Any audit
  // failure aborts the transaction; aborted/retried transactions leave no false event.
  await collection().insertOne({_id: crypto.randomUUID(), requestId: req.levoksRequestId || null, endpointId, blockId, method: endpoint.method, event: audit.event, phase: 'transaction_committed', createdAt: now, expiresAt: new Date(now.getTime() + audit.retentionDays * 86400000), ...(audit.recordActor && typeof req.user?.sub === 'string' ? {actorId: req.user.sub.slice(0, 120)} : {}), ...(audit.recordTenant && typeof req.user?.tenantId === 'string' ? {tenantId: req.user.tenantId.slice(0, 120)} : {})}, {session, maxTimeMS: 2000});
};
function classify(err) {
  const status = Number(err.status || err.statusCode);
  if (err.code === 11000 || status === 409) return ['conflict', 409];
  if (err.name === 'ValidationError' || err.name === 'CastError' || [400, 413, 422].includes(status)) return ['validation', [413, 422].includes(status) ? status : 400];
  if ([401, 403, 404].includes(status)) return [{401:'unauthorized',403:'forbidden',404:'not_found'}[status], status];
  if (['MongoNetworkError', 'MongoServerSelectionError'].includes(err.name) || [502, 503, 504].includes(status)) return ['unavailable', 503];
  return ['internal', status >= 500 && status <= 599 ? status : 500];
}
exports.error = (err, req, res, next) => {
  const [kind, status] = classify(err), rule = errors.rules.find(r => r.kind === kind);
  if (errors.logErrors) console.error(JSON.stringify({event: 'request.error', ...metadata(req), kind, status: rule?.status || status}));
  if (res.headersSent) {res.destroy(); return;}
  res.status(rule?.status || status).json({error: {code: kind, message: rule?.message || errors.fallbackMessage, requestId: req.levoksRequestId}});
};
`.trim();
}
