/** A concrete, auditable auth controller for the built-in User/JWT template. */
export const authController = (
  modelName: string,
  hashRounds: number,
  expiry: string,
) =>
  `
const User = require('../models/${modelName}');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dummyHash = bcrypt.hashSync('invalid-password-comparison', ${hashRounds});
exports.limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const ready = () => process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32;
const identity = user => ({ id: String(user._id), email: user.email, name: user.name });
exports.register = async (req, res) => {
  if (!ready()) return res.status(503).json({ error: 'Authentication is not configured' });
  const { email, password, name } = req.body;
  if (typeof email !== 'string' || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Provide a valid email, name, and a password of at least 12 characters (at most 72 bytes)' });
  try {
    const user = await User.create({ email: email.trim().toLowerCase(), name: name.trim().slice(0, 200), password: await bcrypt.hash(password, ${hashRounds}), role: 'user' });
    return res.status(201).json(identity(user));
  } catch (error) { return res.status(error.code === 11000 ? 409 : 500).json({ error: 'Unable to create account' }); }
};
exports.login = async (req, res) => {
  if (!ready()) return res.status(503).json({ error: 'Authentication is not configured' });
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) return res.status(401).json({ error: 'Invalid credentials' });
  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    const valid = await bcrypt.compare(password, user?.password || dummyHash);
    if (!user || !valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: String(user._id), role: user.role || 'user', ...(user.tenantId ? { tenantId: String(user.tenantId) } : {}) }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: ${JSON.stringify(expiry)} });
    res.cookie('levoks_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/' });
    return res.json(identity(user));
  } catch { return res.status(500).json({ error: 'Login failed' }); }
};
exports.profile = async (req, res) => {
  try { const user = await User.findById(req.user.sub); if (!user) return res.status(404).json({ error: 'Account not found' }); return res.json(identity(user)); }
  catch { return res.status(500).json({ error: 'Profile could not be loaded' }); }
};
exports.logout = (req, res) => { res.clearCookie('levoks_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/' }); res.status(204).end(); };
`.trim();
