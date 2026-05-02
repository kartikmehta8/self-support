import type { AppConfig } from "../../config/env.js";

/**
 * Checks whether a Discord interaction member has a configured support admin role.
 *
 * @param config Application configuration with admin role IDs.
 * @param member Discord interaction member payload.
 * @returns True when the member can perform admin actions.
 */
export function isSupportAdmin(config: AppConfig, member: unknown): boolean {
  if (config.discord.adminRoleIds.length === 0) {
    return true;
  }

  if (!member) {
    return false;
  }

  const roles = (member as { roles?: { cache?: { has(roleId: string): boolean } } | string[] })
    .roles;
  if (Array.isArray(roles)) {
    return config.discord.adminRoleIds.some((roleId) => roles.includes(roleId));
  }

  return config.discord.adminRoleIds.some((roleId) => roles?.cache?.has(roleId) ?? false);
}
