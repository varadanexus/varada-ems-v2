"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Lightbulb, LoaderCircle, RefreshCw } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

type Trend = {
  id: string;
  signal_type: string;
  title: string;
  source: string | null;
  source_url: string | null;
  region: string | null;
  score: number;
  discovered_at: string;
};

export function TrendIntelligence() {
  const [items, setItems] = useState<Trend[] | null>(null);
  const [kind, setKind] = useState("all");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await socialEdgeFetch<Trend[]>("list_trends");
      setItems(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Trends could not be loaded.");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const kinds = useMemo(() => ["all", ...new Set((items || []).map((item) => item.signal_type))], [items]);
  const visible = (items || []).filter((item) => kind === "all" || item.signal_type === kind);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Trend refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Research intelligence"
        title="Trends"
        description="Current industry news, seasonal opportunities, format signals, competitor research, and campaign inputs—persisted with source provenance."
        icon={Lightbulb}
        actions={<button onClick={refresh} disabled={refreshing} className="btn-primary">{refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Research now</button>}
      />
      {items && <div className="flex flex-wrap gap-2">{kinds.map((item) => <button key={item} onClick={() => setKind(item)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${kind === item ? "border-accent bg-accent-soft text-accent" : "text-muted"}`}>{item}</button>)}</div>}
      {error && <ErrorState message={error} retry={load} />}
      {!items ? <LoadingState label="Loading trend intelligence…" /> : visible.length === 0 ? (
        <EmptyState title="No live trend signals" description="Run research to collect current industry news. Previously discovered signals remain until they expire." />
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <article key={item.id} className="rounded-2xl border bg-surface-raised p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">{item.signal_type}</span>
                <span className="font-display text-lg font-semibold text-accent">{Math.round(Number(item.score))}</span>
              </div>
              <h2 className="mt-5 text-base font-semibold leading-6">{item.title}</h2>
              <p className="mt-3 text-xs text-muted">{item.source || "Nexus intelligence"} · {item.region || "Global"}</p>
              <div className="mt-5 flex items-center justify-between text-xs text-muted">
                <span>{new Date(item.discovered_at).toLocaleDateString("en-IN")}</span>
                {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">Source <ExternalLink size={12} /></a>}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
