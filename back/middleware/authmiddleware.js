const { verifyToken } = require('../config/jwt');

// Guards routes that need a logged-in user with an active business. Reads the
// httpOnly session cookie set by login/signup/select-business and attaches
// { userId, businessId, role } to req.auth for controllers to scope by.
const protect = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  if (!payload.businessId) return res.status(401).json({ error: 'No active business selected.' });

  req.auth = { userId: payload.sub, businessId: payload.businessId, role: payload.role };
  next();
};

// Guards the platform-admin routes. Reads the separate `admin_token` cookie
// (not the business `token`) and attaches { userId } to req.adminAuth.
const protectAdmin = (req, res, next) => {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  if (!payload.admin) return res.status(403).json({ error: 'Not authorized.' });

  req.adminAuth = { userId: payload.sub };
  next();
};

module.exports = { protect, protectAdmin };
