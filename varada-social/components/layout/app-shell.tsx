"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const embedded =
      window.self !== window.top ||
      new URLSearchParams(window.location.search).get("embedded") === "1";
    document.documentElement.classList.toggle("ems-embedded", embedded);
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("#global-search")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      document.documentElement.classList.remove("ems-embedded");
    };
  }, []);

  return (
    <div className="nexus-app-shell min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <div className="nexus-module-navigation">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>
      <div className="nexus-module-main min-w-0">
        <div className="nexus-module-topbar">
          <Topbar onMenu={() => setSidebarOpen(true)} />
        </div>
        <main className="nexus-module-content mx-auto max-w-[1540px] px-4 pb-10 pt-6 sm:px-7 lg:px-9">
          {children}
        </main>
      </div>
    </div>
  );
}
