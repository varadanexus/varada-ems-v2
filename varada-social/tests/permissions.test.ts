import { describe, expect, it } from "vitest";
import { can, requirePermission } from "@/modules/auth/permissions";

describe("role permissions", () => {
  it("allows a super admin to manage settings", () => {
    expect(can("super_admin", "settings.manage")).toBe(true);
  });

  it("prevents a content creator from publishing", () => {
    expect(can("content_creator", "content.publish")).toBe(false);
  });

  it("allows a client to review without editing", () => {
    expect(can("client", "content.review")).toBe(true);
    expect(can("client", "content.edit")).toBe(false);
  });

  it("throws when a permission is absent", () => {
    expect(() => requirePermission("viewer", "content.create")).toThrow(
      'Role "viewer" cannot perform "content.create".',
    );
  });
});
