"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CalendarClock, Copy, FileStack, Rocket, Search, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/utils/cn";

type Item = {
  id: string;
  title: string;
  format: string;
  status: string;
  platforms: string[];
  scheduled_for: string | null;
  updated_at: string;
  rejection_reason?: string | null;
  category?: string | null;
  safety_status?: string;
  automation_run_id?: string | null;
};

const statuses = ["all", "draft", "manager_review", "admin_review", "approved", "scheduled", "published", "rejected", "failed", "archived"];

export function ContentLibrary({ approvalOnly = false }: { approvalOnly?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [status, setStatus] = useState(approvalOnly ? "manager_review" : "all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await socialEdgeFetch<Item[]>("list_content", {
        status: !approvalOnly && status !== "all" ? status : undefined,
      });
      setItems(approvalOnly ? data.filter((item) => ["manager_review", "admin_review"].includes(item.status)) : data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Content could not be loaded.");
    }
  }, [approvalOnly, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(
    () => (items || []).filter((item) => item.title.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  async function act(item: Item, action: string) {
    setBusy(item.id + action);
    setError("");
    try {
      let comment: string | undefined;
      let scheduledFor: string | undefined;
      if (action === "reject") {
        comment = window.prompt("Reason for rejection:") || undefined;
        if (!comment) return;
      }
      if (action === "schedule") {
        const raw = window.prompt("Schedule in ISO format (example: 2026-07-29T10:30:00+05:30)");
        if (!raw) return;
        scheduledFor = new Date(raw).toISOString();
      }
      await socialEdgeFetch("content_action", {
        contentId: item.id,
        contentAction: action,
        comment,
        scheduledFor,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={approvalOnly ? "Governance" : "Content operations"}
        title={approvalOnly ? "Approvals" : "Content library"}
        description={approvalOnly
          ? "Manager and admin review stages are enforced and every decision is written to the audit trail."
          : "Draft, review, schedule, publish, duplicate, or archive every campaign from one live library."}
        icon={approvalOnly ? Send : FileStack}
        actions={<Link href="/create" className="btn-primary"><Sparkles size={16} /> Create with AI</Link>}
      />

      <section className="flex flex-col gap-3 rounded-2xl border bg-surface p-3 sm:flex-row">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border bg-background px-3">
          <Search size={16} className="text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search content…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        {!approvalOnly && (
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border bg-background px-3 text-sm capitalize">
            {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        )}
      </section>

      {error && <ErrorState message={error} retry={load} />}
      {!items ? <LoadingState /> : visible.length === 0 ? (
        <EmptyState
          title={approvalOnly ? "No content is awaiting approval" : "No content matches this view"}
          description={approvalOnly ? "Submitted drafts will appear here automatically." : "Create a campaign or change the filters."}
          action={!approvalOnly && <Link href="/create" className="btn-primary">Create campaign</Link>}
        />
      ) : (
        <section className="overflow-hidden rounded-2xl border bg-surface-raised">
          <div className="hidden grid-cols-[minmax(220px,1fr)_130px_150px_155px_minmax(250px,auto)] gap-4 border-b px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-muted lg:grid">
            <span>Campaign</span><span>Status</span><span>Channels</span><span>Schedule</span><span>Actions</span>
          </div>
          <div className="divide-y">
            {visible.map((item) => (
              <article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,1fr)_130px_150px_155px_minmax(250px,auto)] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs capitalize text-muted">{item.format.replaceAll("_", " ")} · Updated {new Date(item.updated_at).toLocaleDateString("en-IN")}</p>
                  {(item.category || item.automation_run_id) && <p className="mt-1 text-xs text-accent">{item.category || "Automated campaign"}{item.automation_run_id ? " · AI plan" : ""}</p>}
                  {item.rejection_reason && <p className="mt-1 text-xs text-red-300">{item.rejection_reason}</p>}
                </div>
                <div className="space-y-1.5"><StatusBadge status={item.status} />{item.safety_status && item.safety_status !== "pending" && <p className={cn("text-[10px] font-bold uppercase tracking-wider", item.safety_status === "passed" ? "text-emerald-300" : "text-amber-300")}>{item.safety_status.replace("_", " ")}</p>}</div>
                <p className="truncate text-xs capitalize text-muted">{item.platforms.join(", ")}</p>
                <p className="text-xs text-muted">{item.scheduled_for ? new Date(item.scheduled_for).toLocaleString("en-IN") : "Not scheduled"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {["draft", "rejected"].includes(item.status) && <Action label="Submit" icon={Send} disabled={busy === item.id + "submit"} onClick={() => act(item, "submit")} />}
                  {["manager_review", "admin_review"].includes(item.status) && <>
                    <Action label="Approve" icon={Send} disabled={busy === item.id + "approve"} onClick={() => act(item, "approve")} />
                    <Action label="Reject" icon={Archive} disabled={busy === item.id + "reject"} onClick={() => act(item, "reject")} />
                  </>}
                  {item.status === "approved" && <>
                    <Action label="Schedule" icon={CalendarClock} disabled={busy === item.id + "schedule"} onClick={() => act(item, "schedule")} />
                    <Action label="Publish" icon={Rocket} disabled={busy === item.id + "publish"} onClick={() => act(item, "publish")} />
                  </>}
                  <Action label="Duplicate" icon={Copy} disabled={busy === item.id + "duplicate"} onClick={() => act(item, "duplicate")} />
                  {!["archived", "published"].includes(item.status) && <Action label="Archive" icon={Archive} disabled={busy === item.id + "archive"} onClick={() => act(item, "archive")} />}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Action({ label, icon: Icon, onClick, disabled }: { label: string; icon: typeof Send; onClick: () => void; disabled: boolean }) {
  return <button disabled={disabled} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:border-accent/40 hover:text-foreground disabled:opacity-50"><Icon size={12} /> {label}</button>;
}
