const jwt = require('jsonwebtoken');
const config = require('../config');

function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.accessPrivateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.accessExpiry,
  });
}

// expiresIn is optional — defaults to config value (pass '30d' for remember-me)
function signRefreshToken(payload, expiresIn) {
  return jwt.sign(payload, config.jwt.refreshPrivateKey, {
    algorithm: 'RS256',
    expiresIn: expiresIn || config.jwt.refreshExpiry,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessPublicKey, { algorithms: ['RS256'] });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshPublicKey, { algorithms: ['RS256'] });
}

// Short-lived token (5 min) issued after password check when 2FA is required.
// Uses the access key pair — no extra secret needed.
function signTempToken(payload) {
  return jwt.sign(
    { ...payload, type: '2fa_pending' },
    config.jwt.accessPrivateKey,
    { algorithm: 'RS256', expiresIn: '5m' }
  );
}

function verifyTempToken(token) {
  const decoded = jwt.verify(token, config.jwt.accessPublicKey, { algorithms: ['RS256'] });
  if (decoded.type !== '2fa_pending') throw new Error('Invalid token type');
  return decoded;
}

module.exports = {
  signAccessToken, signRefreshToken,
  verifyAccessToken, verifyRefreshToken,
  signTempToken, verifyTempToken,
};
