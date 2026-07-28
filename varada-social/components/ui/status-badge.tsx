import { cn } from "@/utils/cn";

const tones: Record<string, string> = {
  draft: "bg-white/5 text-muted",
  manager_review: "bg-amber-500/12 text-amber-300",
  admin_review: "bg-orange-500/12 text-orange-300",
  approved: "bg-emerald-500/12 text-emerald-300",
  scheduled: "bg-blue-500/12 text-blue-300",
  publishing: "bg-violet-500/12 text-violet-300",
  published: "bg-emerald-500/12 text-emerald-300",
  rejected: "bg-red-500/12 text-red-300",
  failed: "bg-red-500/12 text-red-300",
  archived: "bg-white/5 text-muted",
  active: "bg-emerald-500/12 text-emerald-300",
  expired: "bg-amber-500/12 text-amber-300",
  disconnected: "bg-white/5 text-muted",
  error: "bg-red-500/12 text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", tones[status] || tones.draft)}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
