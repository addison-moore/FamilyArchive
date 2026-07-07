/** Roles and permission ordering (PRD §8). */

/** Instance-level role. The Owner has full instance control (PRD §8.1). */
export const GLOBAL_ROLES = ["owner", "user"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** Per-tree roles, most privileged first (PRD §8.3). */
export const TREE_ROLES = ["admin", "editor", "contributor", "viewer"] as const;
export type TreeRole = (typeof TREE_ROLES)[number];

const TREE_ROLE_RANK: Record<TreeRole, number> = {
  admin: 4,
  editor: 3,
  contributor: 2,
  viewer: 1,
};

/** True when `role` grants at least the privileges of `minimum`. */
export function treeRoleAtLeast(role: TreeRole, minimum: TreeRole): boolean {
  return TREE_ROLE_RANK[role] >= TREE_ROLE_RANK[minimum];
}

export function isTreeRole(value: unknown): value is TreeRole {
  return typeof value === "string" && (TREE_ROLES as readonly string[]).includes(value);
}
