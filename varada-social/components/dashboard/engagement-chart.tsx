const bars = [37, 45, 39, 58, 52, 69, 62, 78, 71, 88, 82, 96];

export function EngagementChart() {
  return (
    <article className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Engagement overview</p>
          <div className="mt-2 flex items-baseline gap-3">
            <p className="font-display text-3xl font-semibold tracking-[-0.04em]">
              24.8K
            </p>
            <span className="text-xs font-semibold text-success">+16.4%</span>
          </div>
        </div>
        <select className="rounded-lg border bg-surface px-2.5 py-2 text-xs text-muted">
          <option>Last 30 days</option>
          <option>Last 90 days</option>
        </select>
      </div>
      <div className="mt-8 flex h-44 items-end gap-2 sm:gap-3">
        {bars.map((height, index) => (
          <div key={index} className="group flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-brand/15 transition group-hover:bg-accent"
              style={{ height: `${height}%` }}
              title={`${height * 23} interactions`}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[10px] uppercase tracking-wider text-muted/70">
        <span>01 Jul</span>
        <span>08 Jul</span>
        <span>15 Jul</span>
        <span>22 Jul</span>
        <span>28 Jul</span>
      </div>
    </article>
  );
}
