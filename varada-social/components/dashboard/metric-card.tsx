import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/utils/cn";

const tones = {
  green: "border border-[#2f5848] bg-[#10261f]",
  orange: "border border-accent/25 bg-accent-soft",
  cream: "border border-[#534426] bg-[#221d14]",
  mint: "border border-[#294b43] bg-[#102620]",
};

export function MetricCard({
  label,
  value,
  change,
  caption,
  tone,
}: {
  label: string;
  value: string;
  change: string;
  caption: string;
  tone: keyof typeof tones;
}) {
  const positive = change.startsWith("+");
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <article className={cn("rounded-2xl p-5", tones[tone])}>
      <p className="text-sm font-medium text-muted">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="font-display text-3xl font-semibold tracking-[-0.045em]">
          {value}
        </p>
        <span className="mb-1 flex items-center gap-0.5 rounded-full bg-surface-raised/60 px-2 py-1 text-xs font-semibold text-brand">
          {change} <Icon size={13} />
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">{caption}</p>
    </article>
  );
}
