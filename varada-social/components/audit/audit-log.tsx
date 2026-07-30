"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

type Audit = {
  id: number;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
  app_users?: { display_name?: string; email?: string } | null;
};

export function AuditLog() {
  const [items, setItems] = useState<Audit[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await socialEdgeFetch<Audit[]>("audit");
      setItems(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Audit history could not be loaded.");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Governance" title="Audit history" description="Immutable activity history for content, approvals, accounts, publishing, and integration changes." icon={ScrollText} />
      {error && <ErrorState message={error} retry={load} />}
      {!items ? <LoadingState /> : items.length === 0 ? <EmptyState title="No social audit events yet" description="Actions performed in this module will appear here." /> : (
        <section className="overflow-hidden rounded-2xl border bg-surface-raised">
          <div className="divide-y">
            {items.map((item) => (
              <article key={item.id} className="grid gap-2 p-4 sm:grid-cols-[180px_1fr_180px] sm:items-center">
                <p className="text-xs text-muted">{new Date(item.created_at).toLocaleString("en-IN")}</p>
                <div><p className="text-sm font-semibold">{item.action.replaceAll(".", " ")}</p><p className="mt-1 text-xs text-muted">{item.resource_type}{item.resource_id ? ` · ${item.resource_id}` : ""}</p></div>
                <p className="text-xs text-muted sm:text-right">{item.app_users?.display_name || item.app_users?.email || "System"}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
