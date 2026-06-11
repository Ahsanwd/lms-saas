const AppError = require('../utils/AppError');

// Validates password against a tenant's configurable policy.
// policy defaults match the platform baseline (uppercase + lowercase + number, 8 chars).
function validatePasswordPolicy(password, policy = {}) {
  const minLength      = policy.minLength        ?? 8;
  const reqUppercase   = policy.requireUppercase  ?? true;
  const reqLowercase   = policy.requireLowercase  ?? true;
  const reqNumbers     = policy.requireNumbers    ?? true;
  const reqSymbols     = policy.requireSymbols    ?? false;

  if (!password || password.length < minLength)
    throw new AppError(`Password must be at least ${minLength} characters`, 400);
  if (reqUppercase && !/[A-Z]/.test(password))
    throw new AppError('Password must contain at least one uppercase letter', 400);
  if (reqLowercase && !/[a-z]/.test(password))
    throw new AppError('Password must contain at least one lowercase letter', 400);
  if (reqNumbers && !/\d/.test(password))
    throw new AppError('Password must contain at least one number', 400);
  if (reqSymbols && !/[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(password))
    throw new AppError('Password must contain at least one special character', 400);
}

function validateRegister({ firstName, lastName, email, password }, passwordPolicy) {
  if (!firstName?.trim()) throw new AppError('First name is required', 400);
  if (!lastName?.trim())  throw new AppError('Last name is required', 400);
  if (!email?.trim())     throw new AppError('Email is required', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError('Invalid email format', 400);
  validatePasswordPolicy(password, passwordPolicy);
}

function validateLogin({ email, password }) {
  if (!email?.trim()) throw new AppError('Email is required', 400);
  if (!password)      throw new AppError('Password is required', 400);
}

function validateResetPassword({ password }, passwordPolicy) {
  validatePasswordPolicy(password, passwordPolicy);
}

module.exports = { validateRegister, validateLogin, validateResetPassword, validatePasswordPolicy };
