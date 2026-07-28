"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FileEdit,
  Radio,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { socialEdgeFetch } from "@/lib/api/client";
import type { DashboardData } from "@/types/social";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";

const formatter = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export function LiveDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await socialEdgeFetch<DashboardData>("dashboard");
      setData(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dashboard failed to load.");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <LoadingState label="Loading social operations…" />;
  const metrics = [
    { label: "Today's posts", value: data.metrics.today, icon: CalendarClock },
    { label: "Scheduled", value: data.metrics.scheduled, icon: Radio },
    { label: "Published", value: data.metrics.published, icon: CheckCircle2 },
    { label: "Drafts", value: data.metrics.drafts, icon: FileEdit },
    { label: "Pending approvals", value: data.metrics.pendingApprovals, icon: Users },
    { label: "Reach", value: data.metrics.reach, icon: TrendingUp },
    { label: "Engagement", value: `${data.metrics.engagementRate.toFixed(1)}%`, icon: BarChart3 },
    { label: "Follower growth", value: data.metrics.followerGrowth, icon: Sparkles },
  ];
  const max = Math.max(...data.engagementSeries.map((item) => item.interactions), 1);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">
            {new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.045em] sm:text-[2.5rem]">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {data.userName}.
          </h1>
          <p className="mt-2 text-sm text-muted sm:text-base">
            Live social operations across {data.accountsConnected} connected {data.accountsConnected === 1 ? "account" : "accounts"}.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/calendar" className="btn-secondary">Schedule</Link>
          <Link href="/create" className="btn-primary"><Sparkles size={16} /> Create with AI</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }, index) => (
          <motion.article
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.035 }}
            className="rounded-2xl border bg-surface-raised p-5"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{label}</p>
              <Icon size={17} className="text-accent" />
            </div>
            <p className="mt-5 font-display text-3xl font-semibold">
              {typeof value === "number" ? formatter.format(value) : value}
            </p>
          </motion.article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
        <article className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted">Engagement overview</p>
              <p className="mt-2 font-display text-3xl font-semibold">{formatter.format(data.metrics.interactions)}</p>
            </div>
            <span className="text-xs text-muted">Last 30 days</span>
          </div>
          {data.engagementSeries.length ? (
            <>
              <div className="mt-8 flex h-44 items-end gap-2">
                {data.engagementSeries.map((item) => (
                  <div key={item.date} className="group flex h-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-accent/25 transition hover:bg-accent"
                      style={{ height: `${Math.max(4, item.interactions / max * 100)}%` }}
                      title={`${item.date}: ${item.interactions} interactions`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-[10px] uppercase text-muted">
                <span>{data.engagementSeries[0]?.date}</span>
                <span>{data.engagementSeries.at(-1)?.date}</span>
              </div>
            </>
          ) : (
            <div className="mt-6">
              <EmptyState
                title="No synchronized analytics yet"
                description="Connect a Meta account and publish content. Reach and engagement will appear after the analytics workflow runs."
                action={<Link href="/accounts" className="btn-secondary">Connect account</Link>}
              />
            </div>
          )}
        </article>

        <article className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
          <p className="text-sm text-muted">Trend intelligence</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Current opportunities</h2>
          {data.trends.length ? (
            <div className="mt-5 space-y-2">
              {data.trends.map((trend) => (
                <div key={trend.id} className="flex items-center gap-3 rounded-xl border bg-surface p-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-xs font-bold text-accent">{Math.round(trend.score)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{trend.title}</p>
                    <p className="text-xs capitalize text-muted">{trend.signal_type} · {trend.source || "Nexus"}</p>
                  </div>
                </div>
              ))}
              <Link href="/trends" className="mt-3 inline-flex text-sm font-semibold text-accent">Open trend intelligence →</Link>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState title="No trend signals yet" description="Run trend research to collect current industry news and campaign opportunities." />
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
          <p className="text-sm text-muted">Approval pipeline</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Content operations</h2>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              ["Drafts", data.pipeline.draft || 0],
              ["In review", (data.pipeline.manager_review || 0) + (data.pipeline.admin_review || 0)],
              ["Approved", data.pipeline.approved || 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-surface p-4">
                <p className="font-display text-2xl font-semibold">{value}</p>
                <p className="mt-1 text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
          <Link href="/approvals" className="mt-4 inline-flex text-sm font-semibold text-accent">Review approvals →</Link>
        </article>

        <article className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
          <p className="text-sm text-muted">Publishing queue</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Upcoming posts</h2>
          {data.upcoming.length ? (
            <div className="mt-4 divide-y">
              {data.upcoming.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0">
                  <div className="w-20 shrink-0 text-xs text-muted">
                    {item.scheduled_for && new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduled_for))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="text-xs capitalize text-muted">{item.format.replace("_", " ")} · {item.platforms.join(", ")}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState title="Nothing is scheduled" description="Approved content can be scheduled from the content library or calendar." />
            </div>
          )}
        </article>
      </section>

      {data.recommendation && (
        <section className="rounded-2xl border border-accent/25 bg-accent-soft p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Nexus intelligence</p>
          <p className="mt-2 text-sm">{data.recommendation}</p>
        </section>
      )}
    </div>
  );
}
