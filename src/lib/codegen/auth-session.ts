/** Emitted only for identity services: session state and refresh material never enter the visual IR. */
export function authSessionRuntime(
  modelName: string,
  expiry: string,
  refreshDays = 7,
  idleMinutes = 60,
  cookieSuffix = "",
) {
  return `
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/${modelName}');
const schema = new mongoose.Schema({
  _id: String, userId: {type: mongoose.Schema.Types.ObjectId, required: true, index: true},
  authVersion: {type: Number, required: true}, refreshHash: {type: String, required: true, select: false},
  usedHashes: {type: [String], select: false}, rotations: {type: Number, default: 0},
  expiresAt: {type: Date, required: true, index: {expireAfterSeconds: 0}},
  lastUsedAt: {type: Date, required: true}, revokedAt: {type: Date, default: null},
  createdAt: {type: Date, default: Date.now}, agent: String
}, {versionKey: false});
const Session = mongoose.models.LevoksIdentitySession || mongoose.model('LevoksIdentitySession', schema);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieOptions = {httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/'};
const accessCookie = ${JSON.stringify('levoks_session' + cookieSuffix)}, refreshCookie = ${JSON.stringify('levoks_refresh' + cookieSuffix)};
const idleMs = ${idleMinutes} * 60 * 1000;
const principal = user => ({sub: String(user._id), role: user.role || 'user', ...(user.tenantId ? {tenantId: String(user.tenantId)} : {})});
const activeFilter = () => ({revokedAt: null, expiresAt: {$gt: new Date()}, lastUsedAt: {$gt: new Date(Date.now() - idleMs)}});
const fail = (status, message) => Object.assign(new Error(message), {status});
exports.cookie = (req, name) => {
  try { return decodeURIComponent(req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || ''); }
  catch { return ''; }
};
exports.checkOrigin = req => {
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(v => v.trim());
  if (!origins.includes(req.headers.origin)) throw fail(403, 'Origin not allowed');
};
exports.clear = res => { res.clearCookie(accessCookie, cookieOptions); res.clearCookie(refreshCookie, cookieOptions); };
function setTokens(user, session, refresh, res) {
  const token = jwt.sign({...principal(user), sid: session._id}, process.env.JWT_SECRET, {algorithm: 'HS256', expiresIn: ${JSON.stringify(expiry)}});
  res.set('Cache-Control', 'no-store');
  res.cookie(accessCookie, token, {...cookieOptions, maxAge: Math.max(0, (jwt.decode(token).exp * 1000) - Date.now())});
  res.cookie(refreshCookie, session._id + '.' + refresh, {...cookieOptions, maxAge: Math.max(0, session.expiresAt.getTime() - Date.now())});
}
exports.issue = async (user, req, res) => {
  const refresh = crypto.randomBytes(32).toString('base64url');
  const session = await Session.create({_id: crypto.randomUUID(), userId: user._id, authVersion: user.authVersion || 0, refreshHash: hash(refresh), usedHashes: [], expiresAt: new Date(Date.now() + ${refreshDays} * 86400000), lastUsedAt: new Date(), agent: String(req.headers?.['user-agent'] || '').slice(0, 250)});
  setTokens(user, session, refresh, res);
};
exports.verify = async decoded => {
  if (typeof decoded.sid !== 'string' || typeof decoded.sub !== 'string') throw fail(401, 'Session is required');
  const session = await Session.findOne({_id: decoded.sid, userId: decoded.sub, ...activeFilter()});
  if (!session) throw fail(401, 'Session expired or revoked');
  const user = await User.findById(decoded.sub).select('+authVersion +disabledAt');
  if (!user || user.disabledAt || (user.authVersion || 0) !== session.authVersion) throw fail(401, 'Account session was revoked');
  await Session.updateOne({_id: session._id, ...activeFilter()}, {$set: {lastUsedAt: new Date()}});
  return {...principal(user), sid: session._id};
};
exports.refresh = async (req, res) => {
  exports.checkOrigin(req);
  const value = exports.cookie(req, refreshCookie);
  const parts = value.split('.');
  if (parts.length !== 2 || !/^[a-f0-9-]{36}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw fail(401, 'Refresh token is invalid');
  const [id, secret] = parts, digest = hash(secret), next = crypto.randomBytes(32).toString('base64url');
  // Compare-and-swap consumes a refresh token exactly once, even across processes.
  const session = await Session.findOneAndUpdate({_id: id, refreshHash: digest, rotations: {$lt: 1000}, ...activeFilter()}, {$set: {refreshHash: hash(next), lastUsedAt: new Date()}, $push: {usedHashes: digest}, $inc: {rotations: 1}}, {new: true});
  if (!session) {
    // Only a proven previously consumed token can revoke a family; random guesses cannot.
    await Session.updateOne({_id: id, usedHashes: digest}, {$set: {revokedAt: new Date()}});
    exports.clear(res); throw fail(401, 'Refresh expired, already used, or revoked. Sign in again.');
  }
  const user = await User.findById(session.userId).select('+authVersion +disabledAt');
  if (!user || user.disabledAt || (user.authVersion || 0) !== session.authVersion) {await Session.updateOne({_id: id}, {$set: {revokedAt: new Date()}}); exports.clear(res); throw fail(401, 'Account session was revoked');}
  setTokens(user, session, next, res);
};
exports.revoke = async (principal, all = false) => {
  await Session.updateMany({userId: principal.sub, ...(all ? {} : {_id: principal.sid})}, {$set: {revokedAt: new Date()}});
};
exports.list = async userId => (await Session.find({userId, ...activeFilter()}).select('_id agent createdAt lastUsedAt expiresAt').sort({createdAt: -1}).limit(50).lean()).map(s => ({id: s._id, agent: s.agent, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, expiresAt: s.expiresAt}));
exports.revokeOne = async (userId, sessionId) => {if (typeof sessionId !== 'string') throw fail(400, 'Session ID required'); await Session.updateOne({_id: sessionId, userId}, {$set: {revokedAt: new Date()}});};
`.trim();
}
