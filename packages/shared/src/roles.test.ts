import { describe, expect, it } from "vitest";

import { isTreeRole, TREE_ROLES, treeRoleAtLeast } from "./roles";

describe("treeRoleAtLeast", () => {
  it("matches the PRD §8.3 ordering across the full role matrix", () => {
    // TREE_ROLES is declared most privileged first; the matrix must agree.
    for (const [roleIndex, role] of TREE_ROLES.entries()) {
      for (const [minIndex, minimum] of TREE_ROLES.entries()) {
        expect(treeRoleAtLeast(role, minimum), `${role} >= ${minimum}`).toBe(roleIndex <= minIndex);
      }
    }
  });
});

describe("isTreeRole", () => {
  it("accepts every tree role", () => {
    for (const role of TREE_ROLES) {
      expect(isTreeRole(role)).toBe(true);
    }
  });

  it("rejects non-tree-role values, including the global owner role", () => {
    expect(isTreeRole("owner")).toBe(false);
    expect(isTreeRole("")).toBe(false);
    expect(isTreeRole(undefined)).toBe(false);
    expect(isTreeRole(1)).toBe(false);
  });
});
