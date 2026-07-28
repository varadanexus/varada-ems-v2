import { describe, expect, it } from "vitest";
import { transition } from "@/modules/workflow/state-machine";

describe("content approval workflow", () => {
  it("enforces manager then admin approval", () => {
    expect(transition("draft", "submit").status).toBe("manager_review");
    expect(transition("manager_review", "approve").status).toBe("admin_review");
    expect(transition("admin_review", "approve").status).toBe("approved");
  });

  it("records rejection and prevents invalid approval", () => {
    expect(transition("manager_review", "reject")).toEqual({
      status: "rejected",
      approvalAction: "rejected",
    });
    expect(() => transition("draft", "approve")).toThrow();
  });
});
