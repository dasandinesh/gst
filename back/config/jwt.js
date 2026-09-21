const jwt = require('jsonwebtoken');

// Full session token: issued once the active business is known (signup, or
// login when the user belongs to exactly one business, or select-business).
const signSessionToken = ({ userId, businessId, role }) =>
  jwt.sign({ sub: userId, businessId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// Short-lived token issued right after password check when a user belongs to
// more than one business — proves who they are without granting access to
// any particular business until they pick one via /select-business.
const signPendingToken = ({ userId }) =>
  jwt.sign({ sub: userId, pending: true }, process.env.JWT_SECRET, { expiresIn: '10m' });

const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

// httpOnly so client-side JS can't read/steal it. The frontend's Vercel
// deployment proxies /api/* to this backend (see fornt/vercel.json), so from
// the browser's perspective every request is same-origin — sameSite 'lax'
// works reliably here. (Cross-site sameSite:'none' was tried previously, but
// browsers increasingly refuse to persist third-party cookies at all, which
// dropped the session on the very next request.)
const cookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: maxAgeMs,
});

const sessionCookieOptions = () => cookieOptions(Number(process.env.COOKIE_EXPIRES_TIME || 7) * 24 * 60 * 60 * 1000);
const pendingCookieOptions = () => cookieOptions(10 * 60 * 1000);

// Clearing a cookie requires the same secure/sameSite attributes it was set
// with, or some browsers won't recognize it as the same cookie to remove.
const clearCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
});

module.exports = { signSessionToken, signPendingToken, verifyToken, sessionCookieOptions, pendingCookieOptions, clearCookieOptions };
