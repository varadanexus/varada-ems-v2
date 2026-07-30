import { BriefcaseBusiness, Camera, MoreHorizontal } from "lucide-react";

const posts = [
  {
    time: "10:30",
    period: "AM",
    title: "The future of Indian logistics",
    type: "Carousel · 7 slides",
    icon: Camera,
    color: "bg-[#2d261a]",
  },
  {
    time: "02:00",
    period: "PM",
    title: "Building with purpose",
    type: "Founder story",
    icon: BriefcaseBusiness,
    color: "bg-[#122b28]",
  },
  {
    time: "06:15",
    period: "PM",
    title: "Behind the build: Vizag",
    type: "Reel · 28 sec",
    icon: Camera,
    color: "bg-[#272218]",
  },
];

export function UpcomingPosts() {
  return (
    <article className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Monday, 28 July</p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.03em]">
            Upcoming posts
          </h2>
        </div>
        <button aria-label="More options" className="rounded-lg p-2 text-muted">
          <MoreHorizontal size={19} />
        </button>
      </div>
      <div className="mt-5 divide-y">
        {posts.map(({ time, period, title, type, icon: Icon, color }) => (
          <div key={title} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
            <div className="w-11 shrink-0">
              <p className="text-sm font-bold">{time}</p>
              <p className="text-[10px] font-medium text-muted">{period}</p>
            </div>
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${color} text-accent`}>
              <Icon size={17} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted">{type}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
