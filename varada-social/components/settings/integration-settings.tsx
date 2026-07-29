"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, CalendarDays, Check, CreditCard, KeyRound, LoaderCircle, Play, Settings, ShieldCheck } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";

type SettingsData = {
  integrations: Array<{ provider: string; key_name: string; last_four: string | null; status: string; updated_at: string | null }>;
  brands: Array<{ id: string; name: string; industry: string | null; voice: Record<string, unknown>; visual_identity: Record<string, unknown> }>;
  brandAssets: Array<{ id: string; name: string; asset_type: string; public_url: string; is_approved: boolean; is_primary: boolean }>;
  automationPolicies: AutomationPolicy[];
  automationRuns: Array<{ id: string; status: string; period_start: string; period_end: string; created_count: number; scheduled_count: number; failed_count: number; started_at: string }>;
  aiBudgets: Array<{ brand_id: string; cloud_project_id: string; credit_currency: "INR"; credit_remaining_at_setup_inr: number; max_automation_spend_inr: number; estimated_spend_inr: number; hard_stop_enabled: boolean; credit_expires_at: string; last_verified_at: string }>;
  mediaJobs: Array<{ id: string; model: string; status: string; duration_seconds: number; estimated_cost_inr: number; public_url: string | null; error_message: string | null; created_at: string; completed_at: string | null }>;
};

type AutomationPolicy = {
  id: string; approval_mode: "manual" | "automatic"; is_enabled: boolean;
  planning_horizon_days: number; posts_per_day: number; platforms: string[];
  preferred_times: string[]; categories: string[]; formats: string[]; last_planned_through: string | null;
};

const integrations = [
  ["openai", "api_key", "OpenAI API key"],
  ["anthropic", "api_key", "Claude API key"],
  ["gemini", "api_key", "Gemini API key"],
  ["vertex", "service_account_json", "Vertex AI service account JSON"],
  ["vertex", "project_id", "Google Cloud project ID"],
  ["vertex", "location", "Vertex AI location (global recommended)"],
  ["meta", "app_id", "Meta App ID"],
  ["meta", "app_secret", "Meta App secret"],
  ["meta", "webhook_verify_token", "Meta webhook verify token"],
  ["linkedin", "access_token", "LinkedIn access token"],
  ["smtp", "url", "SMTP connection URL"],
  ["n8n", "publish_webhook", "n8n publishing webhook"],
  ["n8n", "webhook_secret", "n8n webhook signing secret"],
  ["webhook", "outbound_url", "Outbound webhook URL"],
] as const;

export function IntegrationSettings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await socialEdgeFetch<SettingsData>("settings");
      setData(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be loaded.");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>, provider: string, keyName: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get("value") || "");
    setBusy(`${provider}:${keyName}`);
    try {
      await socialEdgeFetch("save_setting", { provider, keyName, value });
      form.reset();
      setSaved(`${provider}:${keyName}`);
      await load();
      window.setTimeout(() => setSaved(""), 1800);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Secret could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Settings & integrations"
        description="Manage brand profiles and encrypted provider credentials. Existing secrets are masked and cannot be retrieved."
        icon={Settings}
      />
      {error && <ErrorState message={error} retry={load} />}
      {!data ? <LoadingState /> : <>
        <section>
          <h2 className="font-display text-xl font-semibold">Brand profiles</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {data.brands.map((brand) => (
              <article key={brand.id} className="rounded-2xl border bg-surface-raised p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">Active brand</p>
                <h3 className="mt-2 font-display text-lg font-semibold">{brand.name}</h3>
                <p className="mt-1 text-sm text-muted">{brand.industry || "Industry not set"}</p>
              </article>
            ))}
          </div>
        </section>
        <AutomationSettings data={data} reload={load} setError={setError} />
        <CreditGuard data={data} />
        <section>
          <h2 className="font-display text-xl font-semibold">Provider secrets</h2>
          <p className="mt-1 text-sm text-muted">Values are encrypted with AES-256-GCM before database storage.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {integrations.map(([provider, keyName, label]) => {
              const current = data.integrations.find((item) => item.provider === provider && item.key_name === keyName);
              const id = `${provider}:${keyName}`;
              return (
                <form key={id} onSubmit={(event) => save(event, provider, keyName)} className="rounded-2xl border bg-surface-raised p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{label}</p><p className="mt-1 text-xs text-muted">{current ? `Configured ·•••• ${current.last_four || ""}` : "Not configured"}</p></div>
                    <KeyRound size={18} className={current ? "text-success" : "text-muted"} />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input name="value" type="password" autoComplete="new-password" className="field flex-1" placeholder={current ? "Enter replacement value" : "Enter secret value"} required />
                    <button className="btn-primary" disabled={busy === id}>{busy === id ? <LoaderCircle size={15} className="animate-spin" /> : saved === id ? <Check size={15} /> : "Save"}</button>
                  </div>
                </form>
              );
            })}
          </div>
        </section>
      </>}
    </div>
  );
}

function CreditGuard({ data }: { data: SettingsData }) {
  const budget = data.aiBudgets[0];
  if (!budget) return null;
  const formatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
  const available = Math.max(0, Number(budget.max_automation_spend_inr) - Number(budget.estimated_spend_inr));
  const percent = budget.max_automation_spend_inr > 0
    ? Math.min(100, (Number(budget.estimated_spend_inr) / Number(budget.max_automation_spend_inr)) * 100)
    : 0;
  return (
    <section className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-accent"><CreditCard size={15} /> Google Cloud credit guard</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{formatter.format(available)} guarded capacity remains</h2>
          <p className="mt-2 text-sm text-muted">Project {budget.cloud_project_id} · active credit observed {formatter.format(budget.credit_remaining_at_setup_inr)} · expires {new Date(budget.credit_expires_at).toLocaleDateString("en-IN")}.</p>
        </div>
        <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">{budget.hard_stop_enabled ? "Hard stop enabled" : "Hard stop disabled"}</span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} /></div>
      <div className="mt-2 flex justify-between text-xs text-muted"><span>Estimated used {formatter.format(budget.estimated_spend_inr)}</span><span>Automation cap {formatter.format(budget.max_automation_spend_inr)}</span></div>
      {data.mediaJobs.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-muted"><tr><th className="pb-2">Video job</th><th>Model</th><th>Duration</th><th>Reserved</th><th>Status</th></tr></thead><tbody className="divide-y">{data.mediaJobs.slice(0, 5).map((job) => <tr key={job.id}><td className="py-3">{new Date(job.created_at).toLocaleString("en-IN")}</td><td>{job.model}</td><td>{job.duration_seconds}s</td><td>{formatter.format(job.estimated_cost_inr)}</td><td className="capitalize">{job.status}</td></tr>)}</tbody></table></div>}
    </section>
  );
}

function AutomationSettings({
  data,
  reload,
  setError,
}: {
  data: SettingsData;
  reload: () => Promise<void>;
  setError: (message: string) => void;
}) {
  const policy = data.automationPolicies[0];
  const [mode, setMode] = useState<"manual" | "automatic">(policy?.approval_mode || "manual");
  const [enabled, setEnabled] = useState(Boolean(policy?.is_enabled));
  const [days, setDays] = useState(policy?.planning_horizon_days || 14);
  const [postsPerDay, setPostsPerDay] = useState(policy?.posts_per_day || 1);
  const [times, setTimes] = useState((policy?.preferred_times || ["10:00", "17:30"]).map((item) => String(item).slice(0, 5)).join(", "));
  const [busy, setBusy] = useState<"save" | "schedule" | "plan" | "publish" | "">("");
  const [message, setMessage] = useState("");

  async function savePolicy() {
    setBusy("save"); setError(""); setMessage("");
    try {
      await socialEdgeFetch("save_automation_policy", {
        approvalMode: mode,
        isEnabled: enabled,
        planningHorizonDays: days,
        postsPerDay,
        preferredTimes: times.split(",").map((item) => item.trim()),
        platforms: policy?.platforms || ["instagram", "facebook"],
        categories: policy?.categories,
        formats: policy?.formats,
        activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
      });
      if (enabled) {
        const schedule = await socialEdgeFetch<{ createdCount: number; existingCount: number; totalCount: number }>("materialize_schedule", { days });
        setMessage(`Automation policy saved. ${schedule.totalCount} calendar slots are ready (${schedule.createdCount} added, ${schedule.existingCount} already present).`);
      } else {
        setMessage("Automation policy saved.");
      }
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Policy could not be saved."); }
    finally { setBusy(""); }
  }

  async function refreshSchedule() {
    setBusy("schedule"); setError(""); setMessage("");
    try {
      const result = await socialEdgeFetch<{ createdCount: number; existingCount: number; totalCount: number }>("materialize_schedule", { days });
      setMessage(`${result.totalCount} safe draft slots are visible in the calendar (${result.createdCount} added, ${result.existingCount} already present).`); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Calendar schedule could not be created."); }
    finally { setBusy(""); }
  }

  async function createPlan() {
    setBusy("plan"); setError(""); setMessage("");
    try {
      const result = await socialEdgeFetch<{ createdCount: number; scheduledCount: number; failedCount: number }>("automation_plan", { days, maxPosts: Math.min(90, days * postsPerDay) });
      setMessage(`${result.createdCount} campaigns created; ${result.scheduledCount} scheduled; ${result.failedCount} failed.`); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Automation plan failed."); }
    finally { setBusy(""); }
  }

  async function publishDue() {
    setBusy("publish"); setError(""); setMessage("");
    try {
      const result = await socialEdgeFetch<Array<{ status: string }>>("process_due", { limit: 10 });
      setMessage(`${result.filter((item) => item.status === "succeeded").length} due publishing jobs completed.`); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Due jobs could not be processed."); }
    finally { setBusy(""); }
  }

  return (
    <section className="rounded-2xl border bg-surface-raised p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-accent"><Bot size={15} /> AI marketing automation</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Plan weeks of branded content</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Vertex AI creates search-optimized campaigns, the backend applies the approved logo, safety checks run before scheduling, and existing Meta publishing handles Instagram and Facebook.</p>
          <p className="mt-3 text-xs font-semibold text-accent">Editorial mix · 50% posts · 30% carousels · 15% stories · 5% reels</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200"><ShieldCheck size={14} /> {data.brandAssets.filter((asset) => asset.is_approved).length} approved assets</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-muted">Workflow<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="field mt-2 w-full"><option value="manual">Manual approval</option><option value="automatic">Fully automatic</option></select></label>
        <label className="text-xs font-semibold text-muted">Planning horizon<input type="number" min={1} max={30} value={days} onChange={(event) => setDays(Number(event.target.value))} className="field mt-2 w-full" /></label>
        <label className="text-xs font-semibold text-muted">Posts per day<input type="number" min={1} max={6} value={postsPerDay} onChange={(event) => setPostsPerDay(Number(event.target.value))} className="field mt-2 w-full" /></label>
        <label className="text-xs font-semibold text-muted xl:col-span-2">Preferred IST times<input value={times} onChange={(event) => setTimes(event.target.value)} className="field mt-2 w-full" placeholder="10:00, 17:30" /></label>
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4 accent-[var(--accent)]" /> Keep the rolling content plan enabled</label>
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={savePolicy} disabled={Boolean(busy)} className="btn-secondary">{busy === "save" ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Save policy</button>
        <button onClick={refreshSchedule} disabled={Boolean(busy)} className="btn-secondary">{busy === "schedule" ? <LoaderCircle size={15} className="animate-spin" /> : <CalendarDays size={15} />} Fill calendar</button>
        <button onClick={createPlan} disabled={Boolean(busy)} className="btn-primary">{busy === "plan" ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />} Generate content plan</button>
        <button onClick={publishDue} disabled={Boolean(busy)} className="btn-secondary">{busy === "publish" ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />} Process due posts</button>
        <Link href="/calendar" className="btn-secondary"><CalendarDays size={15} /> View publishing calendar</Link>
      </div>
      {message && <p className="mt-4 text-sm text-emerald-200">{message}</p>}
      {data.automationRuns.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-muted"><tr><th className="pb-2">Run</th><th>Period</th><th>Created</th><th>Scheduled</th><th>Failed</th><th>Status</th></tr></thead><tbody className="divide-y">{data.automationRuns.slice(0, 5).map((run) => <tr key={run.id}><td className="py-3">{new Date(run.started_at).toLocaleString("en-IN")}</td><td>{run.period_start} — {run.period_end}</td><td>{run.created_count}</td><td>{run.scheduled_count}</td><td>{run.failed_count}</td><td className="capitalize">{run.status.replace("_", " ")}</td></tr>)}</tbody></table></div>}
    </section>
  );
}
