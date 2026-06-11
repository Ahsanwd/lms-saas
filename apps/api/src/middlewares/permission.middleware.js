const AppError = require('../utils/AppError');

// Checks a specific permission from the JWT payload snapshot.
// Super Admin with '*' bypasses all checks (but actions still audit-logged).
function requirePermission(permission) {
  return (req, res, next) => {
    const { role, permissions } = req.user || {};
    if (!permissions) return next(new AppError('Forbidden', 403));

    if (role === 'super_admin' && permissions.includes('*')) return next();
    if (permissions.includes(permission)) return next();

    next(new AppError(`Permission denied: ${permission}`, 403, 'PERMISSION_DENIED'));
  };
}

// Checks the role field directly.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role) return next(new AppError('Forbidden', 403));
    if (roles.includes(req.user.role)) return next();
    next(new AppError('Insufficient role', 403, 'INSUFFICIENT_ROLE'));
  };
}

module.exports = { requirePermission, requireRole };
