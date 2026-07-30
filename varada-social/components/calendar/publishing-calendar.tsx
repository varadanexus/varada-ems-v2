"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { PostDetailEditor, type SocialContentItem } from "@/components/content/post-detail-editor";

type Item = SocialContentItem;

export function PublishingCalendar() {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const start = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const end = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59), [cursor]);
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
      const result = await socialEdgeFetch<Item[]>("list_content", {
        from: params.get("from"),
        to: params.get("to"),
      });
      setItems(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Calendar failed to load.");
    }
  }, [start, end]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const days = useMemo(() => {
    const cells: Array<Date | null> = Array(start.getDay()).fill(null);
    for (let day = 1; day <= end.getDate(); day += 1) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [cursor, end, start]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Publishing operations"
        title="Content calendar"
        description="A live monthly view of scheduled and published content across every connected channel."
        icon={CalendarDays}
        actions={<>
          <button className="btn-secondary" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
          <button className="btn-secondary" onClick={() => setCursor(new Date())}>Today</button>
          <button className="btn-secondary" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        </>}
      />
      <h2 className="font-display text-xl font-semibold">{cursor.toLocaleString("en-IN", { month: "long", year: "numeric" })}</h2>
      {error && <ErrorState message={error} retry={load} />}
      {!items ? <LoadingState /> : (
        <section className="overflow-x-auto rounded-2xl border bg-surface-raised">
          {items.length === 0 && <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">No content is planned for this month</p><p className="mt-1 text-sm text-muted">Create the rolling schedule in Settings; all new slots remain drafts until generation, safety checks and approval are complete.</p></div>
            <Link href="/settings" className="btn-primary shrink-0"><CalendarDays size={15} /> Fill calendar</Link>
          </div>}
          <div className="min-w-[850px]">
            <div className="grid grid-cols-7 border-b text-center text-[10px] font-bold uppercase tracking-wider text-muted">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="p-3">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const scheduled = day ? items.filter((item) => item.scheduled_for && new Date(item.scheduled_for).toDateString() === day.toDateString()) : [];
                return (
                  <div key={day?.toISOString() || `empty-${index}`} className="min-h-36 border-b border-r p-2">
                    {day && <><span className="text-xs font-semibold text-muted">{day.getDate()}</span>
                      <div className="mt-2 space-y-2">
                        {scheduled.map((item) => (
                          <button key={item.id} onClick={() => setSelected(item)} className="block w-full rounded-lg border bg-background p-2 text-left transition hover:border-accent/45 hover:bg-surface">
                            <p className="truncate text-xs font-semibold">{item.title}</p>
                            <p className="mt-1 text-[10px] text-muted">{new Date(item.scheduled_for!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {item.platforms.join(", ")}</p>
                            {item.category && <p className="mt-1 truncate text-[10px] text-accent">{item.category} · {item.format?.replace("_", " ")}</p>}
                            <div className="mt-2"><StatusBadge status={item.status} /></div>
                          </button>
                        ))}
                      </div>
                    </>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      {selected && <PostDetailEditor key={selected.id} item={selected} onClose={() => setSelected(null)} onSaved={load} />}
    </div>
  );
}
