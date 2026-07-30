"use client";

import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useState } from "react";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const [dark, setDark] = useState(false);

  function toggleTheme() {
    document.documentElement.classList.toggle("dark");
    setDark(document.documentElement.classList.contains("dark"));
  }

  return (
    <header className="sticky top-0 z-30 flex h-18 items-center gap-4 border-b bg-background/85 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="rounded-lg p-2 text-muted hover:bg-surface lg:hidden"
      >
        <Menu size={21} />
      </button>
      <div className="relative hidden w-full max-w-md sm:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} />
        <input
          id="global-search"
          aria-label="Global search"
          className="h-10 w-full rounded-xl border bg-surface pl-10 pr-14 text-sm placeholder:text-muted/70"
          placeholder="Search content, campaigns, analytics..."
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border bg-background px-1.5 py-0.5 text-[10px] text-muted">
          ⌘ K
        </kbd>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="mr-2 hidden items-center gap-2 text-xs font-medium text-muted md:flex">
          <span className="size-2 rounded-full bg-success" />
          All systems ready
        </span>
        <button
          aria-label="Toggle theme"
          onClick={toggleTheme}
          className="grid size-10 place-items-center rounded-xl border bg-surface hover:bg-surface-raised"
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          aria-label="Notifications"
          className="relative grid size-10 place-items-center rounded-xl border bg-surface hover:bg-surface-raised"
        >
          <Bell size={17} />
          <span className="absolute right-2.5 top-2 size-2 rounded-full bg-accent ring-2 ring-surface" />
        </button>
      </div>
    </header>
  );
}
