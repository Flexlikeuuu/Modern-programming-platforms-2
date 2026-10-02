export const ROLES = {
  GUEST: "guest",
  MANAGER: "manager",
  ADMIN: "admin",
};

export const ROLE_RANK = {
  [ROLES.GUEST]: 1,
  [ROLES.MANAGER]: 2,
  [ROLES.ADMIN]: 3,
};

export const canAccess = (userRole, allowedRoles) => allowedRoles.includes(userRole);

