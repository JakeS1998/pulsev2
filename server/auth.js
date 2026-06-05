const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, audit } = require('./db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signUser(user) {
  return jwt.sign({ id: user.id, organisation_id: user.organisation_id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '8h' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

function login(req, res) {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const org = user.organisation_id ? db.prepare('SELECT * FROM organisations WHERE id = ?').get(user.organisation_id) : null;
  audit({ organisationId: user.organisation_id, userId: user.id, action: 'USER_LOGIN', entityType: 'user', entityId: String(user.id), ip: req.ip });
  res.json({ token: signUser(user), user: safeUser(user), organisation: org });
}

function safeUser(user) {
  return { id: user.id, organisation_id: user.organisation_id, name: user.name, email: user.email, role: user.role, mfa_enabled: !!user.mfa_enabled };
}

module.exports = { authRequired, requireRole, login, safeUser };
