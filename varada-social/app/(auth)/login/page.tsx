import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden bg-sidebar p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo />
        <div className="max-w-xl">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-[#9fc8b9]">
            One intelligent workspace
          </p>
          <h1 className="font-display text-6xl font-semibold leading-[1.05] tracking-[-0.055em]">
            Turn every idea into measurable momentum.
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-white/65">
            Research, create, approve, publish and learn—across every brand and
            channel.
          </p>
        </div>
        <p className="text-sm text-white/40">Varada Nexus Private Limited</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-12 lg:hidden">
            <Logo dark />
          </div>
          <p className="text-sm font-semibold text-accent">Welcome back</p>
          <h2 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em]">
            Sign in to Nexus Social
          </h2>
          <p className="mt-3 text-muted">
            Use your organisation account to continue.
          </p>
          <form className="mt-10 space-y-5">
            <label className="block text-sm font-medium">
              Work email
              <input
                className="mt-2 h-12 w-full rounded-xl border bg-surface-raised px-4 text-base placeholder:text-muted/60"
                type="email"
                placeholder="you@varadanexus.com"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                className="mt-2 h-12 w-full rounded-xl border bg-surface-raised px-4 text-base"
                type="password"
              />
            </label>
            <Link
              href="/dashboard"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 font-semibold text-white transition hover:bg-brand-bright"
            >
              Continue to workspace <ArrowRight size={17} />
            </Link>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-muted">
            Demo access is enabled for Milestone 1. Supabase authentication is
            activated when environment credentials are provided.
          </p>
        </div>
      </section>
    </main>
  );
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${dark ? "text-foreground" : "text-white"}`}>
      <span className="grid size-10 place-items-center rounded-xl bg-accent font-display text-sm font-extrabold text-white">
        N
      </span>
      <span className="font-display text-lg font-semibold tracking-[-0.03em]">
        Nexus Social
      </span>
    </div>
  );
}
