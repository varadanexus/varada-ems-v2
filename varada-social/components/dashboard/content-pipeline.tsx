import { CheckCircle2, Clock3, FileEdit, MoreHorizontal } from "lucide-react";

const stages = [
  { label: "Drafts", count: 12, icon: FileEdit, color: "text-[#99715e]" },
  { label: "In review", count: 5, icon: Clock3, color: "text-accent" },
  { label: "Approved", count: 8, icon: CheckCircle2, color: "text-success" },
];

export function ContentPipeline() {
  return (
    <article className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Content operations</p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.03em]">
            Approval pipeline
          </h2>
        </div>
        <button aria-label="More options" className="rounded-lg p-2 text-muted">
          <MoreHorizontal size={19} />
        </button>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        {stages.map(({ label, count, icon: Icon, color }) => (
          <div key={label} className="rounded-xl bg-surface p-3 sm:p-4">
            <Icon size={18} className={color} />
            <p className="mt-5 font-display text-2xl font-semibold">{count}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <div className="mb-2 flex justify-between text-xs">
          <span className="font-medium">Monthly publishing goal</span>
          <span className="text-muted">42 / 60</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full w-[70%] rounded-full bg-brand" />
        </div>
      </div>
    </article>
  );
}
