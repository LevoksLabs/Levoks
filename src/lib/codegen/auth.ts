/** A concrete, auditable auth controller for the built-in User/JWT template. */
export const authController = (modelName: string, hashRounds: number, requireVerifiedEmail = false) =>
  `
const User = require('../models/${modelName}');
const bcrypt = require('bcryptjs');
const sessions = require('../identity/sessions');
const recovery = require('../identity/recovery');
const rateLimit = require('express-rate-limit');
const dummyHash = bcrypt.hashSync('invalid-password-comparison', ${hashRounds});
exports.limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const ready = () => process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32;
const identity = user => ({ id: String(user._id), email: user.email, name: user.name, emailVerified: !!user.emailVerifiedAt });
exports.register = async (req, res) => {
  if (!ready()) return res.status(503).json({ error: 'Authentication is not configured' });
  const { email, password, name } = req.body;
  if (typeof email !== 'string' || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Provide a valid email, name, and a password of at least 12 characters (at most 72 bytes)' });
  try {
    ${requireVerifiedEmail ? "recovery.ready();" : ""}
    const user = await User.create({ email: email.trim().toLowerCase(), name: name.trim().slice(0, 200), password: await bcrypt.hash(password, ${hashRounds}), role: 'user' });
    ${requireVerifiedEmail ? "await recovery.request(user.email, 'verify');" : ""}
    return res.status(201).json(identity(user));
  } catch (error) { return res.status(error.code === 11000 ? 409 : 500).json({ error: 'Unable to create account' }); }
};
exports.login = async (req, res) => {
  if (!ready()) return res.status(503).json({ error: 'Authentication is not configured' });
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) return res.status(401).json({ error: 'Invalid credentials' });
  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password +authVersion +disabledAt');
    const valid = await bcrypt.compare(password, user?.password || dummyHash);
    if (!user || !valid || user.disabledAt) return res.status(401).json({ error: 'Invalid credentials' });
    ${requireVerifiedEmail ? "if (!user.emailVerifiedAt) return res.status(403).json({error: 'Verify your email before signing in. You can request a new verification message.'});" : ""}
    await sessions.issue(user, req, res);
    return res.json(identity(user));
  } catch { return res.status(500).json({ error: 'Login failed' }); }
};
exports.profile = async (req, res) => {
  try { const user = await User.findById(req.user.sub); if (!user) return res.status(404).json({ error: 'Account not found' }); return res.json(identity(user)); }
  catch { return res.status(500).json({ error: 'Profile could not be loaded' }); }
};
exports.logout = async (req, res) => {try {await sessions.revoke(req.user); sessions.clear(res); res.status(204).end();} catch {res.status(503).json({error: 'Session could not be revoked. Retry logout.'});}};
exports.refresh = async (req, res) => {try {if (!ready()) return res.status(503).json({error: 'Authentication is not configured'}); await sessions.refresh(req, res); res.status(204).end();} catch(error) {res.status(error.status || 503).json({error: error.status ? error.message : 'Session refresh unavailable'});}};
exports.sessions = async (req, res) => {try {res.set('Cache-Control', 'no-store'); res.json(await sessions.list(req.user.sub));} catch {res.status(503).json({error: 'Sessions unavailable'});}};
exports['revoke-session'] = async (req, res) => {try {await sessions.revokeOne(req.user.sub, req.body.sessionId); if (req.body.sessionId === req.user.sid) sessions.clear(res); res.status(204).end();} catch(error) {res.status(error.status || 503).json({error: 'Session could not be revoked'});}};
exports['logout-all'] = async (req, res) => {try {await sessions.revoke(req.user, true); sessions.clear(res); res.status(204).end();} catch {res.status(503).json({error: 'Sessions could not be revoked'});}};
exports['change-password'] = async (req, res) => {
  const {currentPassword, newPassword} = req.body;
  if (typeof currentPassword !== 'string' || Buffer.byteLength(currentPassword, 'utf8') > 72 || typeof newPassword !== 'string' || newPassword.length < 12 || Buffer.byteLength(newPassword, 'utf8') > 72) return res.status(400).json({error: 'Provide current password and a new password of 12 characters to 72 bytes'});
  try {
    const user = await User.findById(req.user.sub).select('+password +authVersion');
    if (!user || !await bcrypt.compare(currentPassword, user.password)) return res.status(401).json({error: 'Current password is incorrect'});
    const changed = await User.updateOne({_id: user._id, password: user.password}, {$set: {password: await bcrypt.hash(newPassword, ${hashRounds})}, $inc: {authVersion: 1}});
    if (!changed.modifiedCount) return res.status(409).json({error: 'Account changed. Sign in again.'});
    // Version checking makes all old sessions invalid even if subsequent cleanup is interrupted.
    await sessions.revoke(req.user, true); sessions.clear(res); res.status(204).end();
  } catch {res.status(503).json({error: 'Password change could not be completed. Sign in again to check its status.'});}
};
for (const [action, kind] of [['forgot-password', 'reset'], ['request-verification', 'verify']]) exports[action] = async (req, res) => {
  try {sessions.checkOrigin(req); await recovery.request(req.body.email, kind); res.status(202).json({message: 'If an eligible account exists, instructions have been queued for email delivery.'});}
  catch(error) {res.status(error.status || 503).json({error: error.status ? error.message : 'Identity request unavailable'});}
};
for (const [action, kind] of [['reset-password', 'reset'], ['verify-email', 'verify']]) exports[action] = async (req, res) => {
  try {sessions.checkOrigin(req); await recovery.consume(req.body.token, kind, req.body.newPassword); if (kind === 'reset') sessions.clear(res); res.status(204).end();}
  catch(error) {res.status(error.status || 503).json({error: error.status ? error.message : 'Identity confirmation unavailable'});}
};
`.trim();
