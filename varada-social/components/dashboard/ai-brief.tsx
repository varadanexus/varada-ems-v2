import { ArrowRight, Flame, Sparkles, TrendingUp } from "lucide-react";

const insights = [
  {
    icon: Flame,
    title: "Warehousing automation",
    meta: "Rising fast · Logistics",
    score: "92",
  },
  {
    icon: TrendingUp,
    title: "Sustainable construction",
    meta: "High relevance · India",
    score: "86",
  },
  {
    icon: Sparkles,
    title: "Founder-led storytelling",
    meta: "Strong format match",
    score: "81",
  },
];

export function AiBrief() {
  return (
    <article className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted">AI trend brief</p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.03em]">
            Opportunities today
          </h2>
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
          <Sparkles size={18} />
        </span>
      </div>
      <div className="mt-5 space-y-2">
        {insights.map(({ icon: Icon, title, meta, score }) => (
          <button
            key={title}
            className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-brand/40 hover:bg-surface"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-background text-brand">
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{title}</span>
              <span className="block text-xs text-muted">{meta}</span>
            </span>
            <span className="text-sm font-bold text-brand">{score}</span>
          </button>
        ))}
      </div>
      <button className="mt-4 flex items-center gap-1 text-sm font-semibold text-accent">
        Open trend intelligence <ArrowRight size={15} />
      </button>
    </article>
  );
}
