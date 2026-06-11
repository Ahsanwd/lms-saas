const { verifyAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

// Verifies the Bearer token, attaches req.user, and enforces cross-tenant isolation.
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      throw new AppError('No token provided', 401, 'NO_TOKEN');

    const token = authHeader.slice(7);
    const decoded = verifyAccessToken(token);

    // Super Admin is platform-level — no tenant check needed
    if (decoded.role !== 'super_admin' && req.tenant) {
      if (decoded.tenantId?.toString() !== req.tenant.tenantId?.toString()) {
        throw new AppError('Access denied', 403, 'CROSS_TENANT_VIOLATION');
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
    if (err.name === 'JsonWebTokenError')
      return next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
    next(err);
  }
}

module.exports = { authenticate };
