import {
  PLATFORM_ROLES,
  PRIVILEGED_ROLES,
  type OnboardingIntent,
  type PlatformRoleId,
  type PrivilegedRoleId,
} from "./types";

export function isPlatformRole(value: string): value is PlatformRoleId {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isPrivilegedRole(value: string): value is PrivilegedRoleId {
  return (PRIVILEGED_ROLES as readonly string[]).includes(value);
}

export function roleFromOnboardingIntent(
  intent: OnboardingIntent,
): PlatformRoleId | null {
  switch (intent) {
    case "PRODUCER":
      return "PRODUCER_ADMIN";
    case "INVESTOR":
      return "INVESTOR";
    case "TRADER":
      return "TRADER";
    case "OTHER":
      return null;
  }
}

export function assertAssignableRole(
  roleId: string,
  options: { allowPrivileged: boolean },
): PlatformRoleId {
  if (!isPlatformRole(roleId)) {
    throw new Error("unknown_role");
  }
  if (isPrivilegedRole(roleId) && !options.allowPrivileged) {
    throw new Error("privileged_role_forbidden");
  }
  return roleId;
}
