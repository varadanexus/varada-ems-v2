import type { ContentStatus } from "@/types/social";

export type WorkflowAction = "submit" | "approve" | "reject" | "recall" | "archive";

export function transition(
  current: ContentStatus,
  action: WorkflowAction,
): { status: ContentStatus; approvalAction: string | null } {
  if (action === "submit" && ["draft", "rejected"].includes(current)) {
    return { status: "manager_review", approvalAction: "submitted" };
  }
  if (action === "approve" && current === "manager_review") {
    return { status: "admin_review", approvalAction: "manager_approved" };
  }
  if (action === "approve" && current === "admin_review") {
    return { status: "approved", approvalAction: "admin_approved" };
  }
  if (action === "reject" && ["manager_review", "admin_review"].includes(current)) {
    return { status: "rejected", approvalAction: "rejected" };
  }
  if (action === "recall" && ["manager_review", "admin_review", "approved"].includes(current)) {
    return { status: "draft", approvalAction: "recalled" };
  }
  if (action === "archive" && !["publishing", "published"].includes(current)) {
    return { status: "archived", approvalAction: null };
  }
  throw new Error(`Cannot ${action} content while it is ${current.replaceAll("_", " ")}.`);
}
