export function authRecoveryRuntime(modelName: string, hashRounds: number) {
  return `
const User = require('../models/${modelName}');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const sessions = require('./sessions');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), {status});
function keyring() {
  try {
    const keys = JSON.parse(process.env.IDENTITY_EMAIL_KEYS || '{}');
    const active = process.env.IDENTITY_EMAIL_ACTIVE_KEY;
    if (!active || !keys[active] || Object.values(keys).some(v => typeof v !== 'string' || Buffer.from(v, 'base64').length !== 32)) throw new Error();
    return {active, keys};
  } catch { throw fail(503, 'Identity email encryption is not configured'); }
}
exports.ready = () => {
  keyring();
  try {const url = new URL(process.env.IDENTITY_PUBLIC_URL); if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error(); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();}
  catch {throw fail(503, 'Configure a secure account recovery page URL');}
  if (!process.env.IDENTITY_EMAIL_FROM) throw fail(503, 'Identity email sender is not configured');
};
function encrypt(id, data) {
  const ring = keyring(), nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ring.keys[ring.active], 'base64'), nonce);
  cipher.setAAD(Buffer.from(id));
  return {keyId: ring.active, nonce: nonce.toString('base64'), encrypted: Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]).toString('base64'), tag: cipher.getAuthTag().toString('base64')};
}
function decrypt(mail) {
  const ring = keyring();
  if (!ring.keys[mail.keyId]) throw fail(503, 'Missing identity email decryption key');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ring.keys[mail.keyId], 'base64'), Buffer.from(mail.nonce, 'base64'));
  decipher.setAAD(Buffer.from(mail.id)); decipher.setAuthTag(Buffer.from(mail.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(mail.encrypted, 'base64')), decipher.final()]).toString('utf8'));
}
exports.request = async (email, kind) => {
  exports.ready();
  if (typeof email !== 'string' || email.length > 320 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw fail(400, 'Provide a valid email');
  if (!['reset', 'verify'].includes(kind)) throw fail(400, 'Unknown identity request');
  const now = new Date(), id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
  const prefix = kind === 'reset' ? 'authReset' : 'authVerify';
  const link = new URL(process.env.IDENTITY_PUBLIC_URL); link.hash = new URLSearchParams({mode: kind, token}).toString();
  const payload = {from: process.env.IDENTITY_EMAIL_FROM, to: [email.trim().toLowerCase()], subject: kind === 'reset' ? 'Reset your password' : 'Verify your email', text: (kind === 'reset' ? 'Choose a new password' : 'Confirm your email') + ': ' + link.href + '\\nThis link expires in 30 minutes. If you did not request it, ignore this message.'};
  const mail = {id, status: 'queued', dueAt: now, expiresAt: new Date(Date.now() + 30 * 60000), attempts: 0, ...encrypt(id, payload)};
  // Challenge and encrypted delivery job are one atomic user update, with one pending job per kind.
  await User.updateOne({email: email.trim().toLowerCase(), disabledAt: null, ...(kind === 'verify' ? {emailVerifiedAt: null} : {}), $or: [{[prefix + 'RequestedAt']: null}, {[prefix + 'RequestedAt']: {$lt: new Date(Date.now() - 60000)}}]}, {$set: {[prefix + 'Hash']: hash(token), [prefix + 'ExpiresAt']: mail.expiresAt, [prefix + 'RequestedAt']: now, [prefix + 'Mail']: mail}});
};
exports.consume = async (token, kind, password) => {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || !['reset', 'verify'].includes(kind)) throw fail(400, 'Link is invalid or expired');
  if (kind === 'reset' && (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72)) throw fail(400, 'Password must contain at least 12 characters and at most 72 bytes');
  const prefix = kind === 'reset' ? 'authReset' : 'authVerify';
  const set = kind === 'reset' ? {password: await bcrypt.hash(password, ${hashRounds})} : {emailVerifiedAt: new Date()};
  const user = await User.findOneAndUpdate({[prefix + 'Hash']: hash(token), [prefix + 'ExpiresAt']: {$gt: new Date()}, disabledAt: null}, {$set: set, $unset: {[prefix + 'Hash']: '', [prefix + 'ExpiresAt']: '', [prefix + 'Mail']: ''}, ...(kind === 'reset' ? {$inc: {authVersion: 1}} : {})}, {new: true});
  if (!user) throw fail(400, 'Link is invalid or expired');
  if (kind === 'reset') await sessions.revoke({sub: String(user._id)}, true);
};
exports.processOne = async () => {
  if (!process.env.RESEND_API_KEY) throw fail(503, 'Configure RESEND_API_KEY on the email worker');
  exports.ready();
  for (const prefix of ['authReset', 'authVerify']) {
    const field = prefix + 'Mail', lease = crypto.randomUUID(), now = new Date();
    // Mixed outbox documents cannot use a TTL index without deleting the user.
    // Expire only the challenge and encrypted delivery material, never the account.
    await User.updateMany({[prefix + 'ExpiresAt']: {$lte: now}}, {$unset: {[prefix + 'Hash']: '', [prefix + 'ExpiresAt']: '', [field]: ''}});
    await User.updateMany({disabledAt: {$ne: null}, [field]: {$exists: true}}, {$unset: {[prefix + 'Hash']: '', [prefix + 'ExpiresAt']: '', [field]: ''}});
    const user = await User.findOneAndUpdate({disabledAt: null, [field + '.status']: 'queued', [field + '.dueAt']: {$lte: now}, [field + '.expiresAt']: {$gt: now}, $or: [{[field + '.leaseUntil']: null}, {[field + '.leaseUntil']: {$lt: now}}]}, {$set: {[field + '.lease']: lease, [field + '.leaseUntil']: new Date(Date.now() + 60000)}}, {new: true}).select('+' + field);
    if (!user) continue;
    const mail = user[field], filter = {_id: user._id, [field + '.id']: mail.id, [field + '.lease']: lease};
    try {
      const endpoint = process.env.NODE_ENV === 'test' && process.env.IDENTITY_EMAIL_TEST_ENDPOINT ? process.env.IDENTITY_EMAIL_TEST_ENDPOINT : 'https://api.resend.com/emails';
      const response = await fetch(endpoint, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': mail.id}, body: JSON.stringify(decrypt(mail))});
      if (!response.ok) throw fail([429, 409].includes(response.status) || response.status >= 500 ? 503 : 422, 'Email provider rejected delivery');
      // Remove ciphertext after delivery; retain only bounded operational metadata.
      await User.updateOne(filter, {$set: {[field]: {id: mail.id, status: 'sent', sentAt: new Date(), attempts: mail.attempts + 1}}});
    } catch (error) {
      const retry = (error.status === undefined || error.status === 503) && mail.attempts < 4;
      await User.updateOne(filter, {$set: {[field + '.status']: retry ? 'queued' : 'failed', [field + '.dueAt']: new Date(Date.now() + 30000 * 2 ** mail.attempts), [field + '.error']: 'Delivery failed. Check provider configuration and retry the identity request.'}, $inc: {[field + '.attempts']: 1}, $unset: {[field + '.lease']: '', [field + '.leaseUntil']: ''}});
    }
    return true;
  }
  return false;
};
`.trim();
}

export const IDENTITY_EMAIL_WORKER = `
require('dotenv').config();
const mongoose = require('mongoose');
const recovery = require('../identity/recovery');
let stopping = false;
process.on('SIGTERM', () => {stopping = true;}); process.on('SIGINT', () => {stopping = true;});
(async () => {
  await mongoose.connect(process.env.MONGO_URI); recovery.ready();
  if (!process.env.RESEND_API_KEY) throw new Error('Email provider is not configured');
  while (!stopping) {
    try {if (!await recovery.processOne()) await new Promise(r => setTimeout(r, 2000));}
    catch {console.error('Identity email worker unavailable; check server configuration.'); await new Promise(r => setTimeout(r, 10000));}
  }
  await mongoose.disconnect();
})().catch(() => {console.error('Identity email worker startup failed.'); mongoose.disconnect().finally(() => {process.exitCode = 1;});});
`.trim();
