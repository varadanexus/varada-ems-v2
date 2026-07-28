"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, KeyRound, LoaderCircle, Settings } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingState } from "@/components/ui/states";

type SettingsData = {
  integrations: Array<{ provider: string; key_name: string; last_four: string | null; status: string; updated_at: string | null }>;
  brands: Array<{ id: string; name: string; industry: string | null; voice: Record<string, unknown>; visual_identity: Record<string, unknown> }>;
};

const integrations = [
  ["openai", "api_key", "OpenAI API key"],
  ["anthropic", "api_key", "Claude API key"],
  ["gemini", "api_key", "Gemini API key"],
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
