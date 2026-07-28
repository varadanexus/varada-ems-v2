"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Heart, MessageCircle, Share2, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

type Analytics = {
  totals: {
    likes: number; comments: number; shares: number; saves: number;
    reach: number; impressions: number; interactions: number; engagementRate: number;
  };
  series: Array<{
    id: number;
    captured_at: string;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    reach: number;
    impressions: number;
    social_content_channels?: { platform?: string; social_content_items?: { title?: string; format?: string } };
  }>;
  topContent: Analytics["series"];
};

const number = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export function AnalyticsWorkspace() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await socialEdgeFetch<Analytics>("analytics", { days });
      setData(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analytics could not be loaded.");
    }
  }, [days]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const series = useMemo(() => {
    const byDay = new Map<string, number>();
    (data?.series || []).forEach((row) => {
      const key = row.captured_at.slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + Number(row.reach || 0));
    });
    return [...byDay.entries()].map(([date, reach]) => ({ date, reach }));
  }, [data]);
  const max = Math.max(...series.map((item) => item.reach), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Performance intelligence"
        title="Analytics"
        description="Live metrics synchronized from published social accounts. No estimated or preview figures are shown."
        icon={BarChart3}
        actions={<select value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-11 rounded-xl border bg-surface px-3 text-sm"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select>}
      />
      {error && <ErrorState message={error} retry={load} />}
      {!data ? <LoadingState /> : data.series.length === 0 ? (
        <EmptyState title="No analytics have been synchronized" description="Metrics appear after connected accounts publish content and the analytics synchronization workflow completes." />
      ) : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["Reach", data.totals.reach, TrendingUp],
            ["Engagement", `${data.totals.engagementRate.toFixed(2)}%`, Heart],
            ["Comments", data.totals.comments, MessageCircle],
            ["Shares + saves", data.totals.shares + data.totals.saves, Share2],
          ] as Array<[string, string | number, LucideIcon]>).map(([label, value, Icon]) => (
            <article key={String(label)} className="rounded-2xl border bg-surface-raised p-5">
              <div className="flex justify-between text-sm text-muted"><span>{label}</span><Icon size={17} className="text-accent" /></div>
              <p className="mt-5 font-display text-3xl font-semibold">{typeof value === "number" ? number.format(value) : value}</p>
            </article>
          ))}
        </section>
        <section className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
          <article className="rounded-2xl border bg-surface-raised p-6">
            <h2 className="font-display text-xl font-semibold">Reach over time</h2>
            <div className="mt-8 flex h-56 items-end gap-2">
              {series.map((item) => <div key={item.date} className="flex h-full flex-1 items-end"><div className="w-full rounded-t bg-accent/35 hover:bg-accent" style={{ height: `${Math.max(3, item.reach / max * 100)}%` }} title={`${item.date}: ${item.reach} reach`} /></div>)}
            </div>
          </article>
          <article className="rounded-2xl border bg-surface-raised p-6">
            <h2 className="font-display text-xl font-semibold">Top content</h2>
            <div className="mt-5 space-y-3">
              {data.topContent.slice(0, 6).map((row) => (
                <div key={row.id} className="rounded-xl border bg-surface p-3">
                  <p className="truncate text-sm font-semibold">{row.social_content_channels?.social_content_items?.title || "Published content"}</p>
                  <p className="mt-1 text-xs capitalize text-muted">{row.social_content_channels?.platform || "Channel"} · {number.format(Number(row.reach || 0))} reach</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </>}
    </div>
  );
}
