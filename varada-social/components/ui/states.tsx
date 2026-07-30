import { AlertTriangle, Database, LoaderCircle } from "lucide-react";

export function LoadingState({ label = "Loading live data…" }: { label?: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border bg-surface">
      <div className="text-center text-sm text-muted">
        <LoaderCircle className="mx-auto mb-3 animate-spin text-accent" size={24} />
        {label}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed bg-surface/55 p-8 text-center">
      <div className="max-w-md">
        <Database className="mx-auto text-accent" size={28} />
        <h2 className="mt-4 font-display text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-5 text-sm text-red-200">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
        <div>
          <p className="font-semibold">Live data could not be loaded</p>
          <p className="mt-1 text-red-200/75">{message}</p>
          {retry && <button onClick={retry} className="mt-3 rounded-lg border border-red-300/25 px-3 py-1.5 font-semibold">Retry</button>}
        </div>
      </div>
    </div>
  );
}
