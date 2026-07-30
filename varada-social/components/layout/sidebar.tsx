"use client";

import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  FileStack,
  LayoutDashboard,
  Inbox,
  Camera,
  Lightbulb,
  Megaphone,
  Settings,
  Sparkles,
  Radio,
  ScrollText,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/utils/cn";

const navigation = [
  { label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Create", icon: Sparkles, href: "/create" },
  { label: "Content", icon: FileStack, href: "/content" },
  { label: "Calendar", icon: CalendarDays, href: "/calendar" },
  { label: "Approvals", icon: Users, href: "/approvals" },
  { label: "Trends", icon: Lightbulb, href: "/trends" },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
  { label: "Instagram", icon: Camera, href: "/instagram" },
  { label: "Inbox", icon: Inbox, href: "/inbox" },
  { label: "Accounts", icon: Radio, href: "/accounts" },
  { label: "Ads campaigns", icon: Megaphone, href: "/campaigns" },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col bg-sidebar px-4 py-5 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-2">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent font-display text-sm font-extrabold">
              N
            </span>
            <div>
              <p className="font-display font-semibold tracking-[-0.03em]">
                Nexus Social
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                Intelligence
              </p>
            </div>
          </Link>
          <button
            className="rounded-lg p-2 text-white/60 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        </div>

        <button className="mt-7 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-left">
          <span className="grid size-8 place-items-center rounded-lg bg-[#406d5e] text-xs font-bold">
            VN
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">Varada Nexus</span>
            <span className="block text-[11px] text-white/45">Main workspace</span>
          </span>
          <ChevronDown size={15} className="text-white/45" />
        </button>

        <nav className="mt-7 space-y-1">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
            Workspace
          </p>
          {navigation.map(({ label, icon: Icon, href }) => {
            const active = href !== "#" && pathname === href;
            return (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-white text-sidebar shadow-sm"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.3 : 1.8} />
              <span className="flex-1">{label}</span>
            </Link>
          )})}
        </nav>

        <nav className="mt-auto space-y-1 border-t border-white/10 pt-4">
          <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:text-white" href="/audit">
            <ScrollText size={18} /> Audit history
          </Link>
          <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:text-white" href="/settings">
            <Settings size={18} /> Settings
          </Link>
        </nav>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-black/15 p-3">
          <div className="grid size-9 place-items-center rounded-full bg-[#d8b19d] text-xs font-bold text-[#402e26]">
            SK
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Sai Kiran</p>
            <p className="text-[11px] text-white/40">Super Admin</p>
          </div>
          <ChevronDown size={15} className="text-white/40" />
        </div>
      </aside>
    </>
  );
}
