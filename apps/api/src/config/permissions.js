// Flat permission arrays per role — stored as snapshot in JWT at login time.
// A role change invalidates all sessions forcing re-login for fresh permissions.

const PERMISSIONS = {
  super_admin: ['*'], // bypass flag — all permissions + audit logged

  tenant_admin: [
    'user:create', 'user:read', 'user:update', 'user:delete', 'user:manage',
    'course:create', 'course:read', 'course:update', 'course:delete', 'course:manage',
    'quiz:create', 'quiz:read', 'quiz:update', 'quiz:delete', 'quiz:manage',
    'enrollment:create', 'enrollment:read', 'enrollment:update', 'enrollment:delete', 'enrollment:manage',
    'certificate:create', 'certificate:read', 'certificate:update', 'certificate:delete', 'certificate:manage',
    'category:create', 'category:read', 'category:update', 'category:delete', 'category:manage',
    'assignment:create', 'assignment:read', 'assignment:update', 'assignment:delete', 'assignment:manage',
    'announcement:create', 'announcement:read', 'announcement:update', 'announcement:delete', 'announcement:manage',
    'billing:read', 'billing:manage',
    'analytics:read', 'analytics:manage',
    'settings:read', 'settings:manage',
    'session:read', 'session:manage',
    'media:read', 'media:delete', 'media:manage',
  ],

  instructor: [
    'course:create', 'course:read', 'course:update', 'course:delete', 'course:manage',
    'quiz:create', 'quiz:read', 'quiz:update', 'quiz:delete', 'quiz:manage',
    'assignment:create', 'assignment:read', 'assignment:update', 'assignment:delete', 'assignment:manage',
    'enrollment:read',
    'certificate:create', 'certificate:read',
    'category:read',
    'announcement:create', 'announcement:read', 'announcement:update', 'announcement:delete',
    'analytics:read',
    'user:read', 'user:update', // name edits only — user.service restricts instructors to student profiles
    'media:read',
  ],

  student: [
    'course:read',
    'quiz:read',
    'assignment:read',
    'enrollment:create', 'enrollment:read',
    'certificate:read',
    'category:read',
    'announcement:read',
  ],
};

const getPermissions = (role) => PERMISSIONS[role] || [];

module.exports = { PERMISSIONS, getPermissions };
