const AppError = require('../utils/AppError');

const VALID_ROLES = ['student', 'instructor', 'tenant_admin'];

function validateUpdateProfile({ firstName, lastName }) {
  if (firstName !== undefined && !firstName?.trim())
    throw new AppError('First name cannot be empty', 400);
  if (lastName !== undefined && !lastName?.trim())
    throw new AppError('Last name cannot be empty', 400);
}

function validateChangePassword({ currentPassword, newPassword }) {
  if (!currentPassword) throw new AppError('Current password is required', 400);
  if (!newPassword || newPassword.length < 8)
    throw new AppError('New password must be at least 8 characters', 400);
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword))
    throw new AppError('New password must contain uppercase, lowercase and a number', 400);
  if (currentPassword === newPassword)
    throw new AppError('New password must differ from current password', 400);
}

function validateInvite({ email, role }) {
  if (!email?.trim()) throw new AppError('Email is required', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError('Invalid email format', 400);
  if (!role || !VALID_ROLES.includes(role))
    throw new AppError(`Role must be one of: ${VALID_ROLES.join(', ')}`, 400);
}

function validateUpdateRole({ role }) {
  if (!role || !VALID_ROLES.includes(role))
    throw new AppError(`Role must be one of: ${VALID_ROLES.join(', ')}`, 400);
}

function validateAcceptInvite({ firstName, lastName, password }) {
  if (!firstName?.trim()) throw new AppError('First name is required', 400);
  if (!lastName?.trim()) throw new AppError('Last name is required', 400);
  if (!password || password.length < 8)
    throw new AppError('Password must be at least 8 characters', 400);
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password))
    throw new AppError('Password must contain uppercase, lowercase and a number', 400);
}

module.exports = {
  validateUpdateProfile,
  validateChangePassword,
  validateInvite,
  validateUpdateRole,
  validateAcceptInvite,
};
