"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { LoaderCircle, Megaphone, Pause, Play, Plus, RefreshCw } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";

type AdAccount = {
  external_account_id: string;
  name: string;
  currency: string | null;
  timezone_name: string | null;
  account_status: number | null;
};

type Campaign = {
  external_campaign_id: string;
  name: string;
  objective: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
};

export function CampaignManager() {
  const [accounts, setAccounts] = useState<AdAccount[] | null>(null);
  const [selected, setSelected] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const rows = await socialEdgeFetch<AdAccount[]>("list_ad_accounts");
      setAccounts(rows);
      setSelected((current) => current || rows[0]?.external_account_id || "");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ad accounts could not be loaded.");
      setAccounts([]);
    }
  }, []);

  const loadCampaigns = useCallback(async (adAccountId: string) => {
    if (!adAccountId) {
      setCampaigns([]);
      return;
    }
    setBusy(true);
    try {
      const rows = await socialEdgeFetch<Campaign[]>("list_campaigns", { adAccountId });
      setCampaigns(rows);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaigns could not be loaded.");
      setCampaigns([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccounts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAccounts]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => void loadCampaigns(selected), 0);
    return () => window.clearTimeout(timer);
  }, [loadCampaigns, selected]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await socialEdgeFetch("create_campaign", {
        adAccountId: selected,
        name: values.get("name"),
        objective: values.get("objective"),
        dailyBudget: values.get("dailyBudget") || undefined,
        specialAdCategories: [],
        status: "PAUSED",
      });
      setCreating(false);
      await loadCampaigns(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(campaign: Campaign, status: "ACTIVE" | "PAUSED") {
    setBusy(true);
    try {
      await socialEdgeFetch("update_campaign", {
        campaignId: campaign.external_campaign_id,
        status,
      });
      await loadCampaigns(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Meta Marketing API"
        title="Ads campaigns"
        description="Create, activate, pause, and monitor real Meta campaigns from the EMS."
        icon={Megaphone}
        actions={
          <>
            <button className="btn-secondary" disabled={busy} onClick={() => void loadAccounts()}>
              <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> Sync
            </button>
            <button className="btn-primary" disabled={!selected || busy} onClick={() => setCreating((value) => !value)}>
              <Plus size={16} /> New campaign
            </button>
          </>
        }
      />

      {error && <ErrorState message={error} retry={loadAccounts} />}

      {accounts === null ? <LoadingState /> : accounts.length === 0 ? (
        <EmptyState
          title="No Meta ad accounts available"
          description="Connect Meta from Social Accounts and grant ads_management and ads_read."
        />
      ) : (
        <>
          <section className="rounded-2xl border bg-surface p-5">
            <label className="block max-w-xl">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">Ad account</span>
              <select className="field" value={selected} onChange={(event) => setSelected(event.target.value)}>
                {accounts.map((account) => (
                  <option key={account.external_account_id} value={account.external_account_id}>
                    {account.name} · {account.external_account_id} · {account.currency || "currency unavailable"}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {creating && (
            <form onSubmit={createCampaign} className="grid gap-4 rounded-2xl border bg-surface p-5 md:grid-cols-2">
              <Field label="Campaign name"><input className="field" name="name" required maxLength={180} /></Field>
              <Field label="Objective">
                <select className="field" name="objective" required defaultValue="OUTCOME_AWARENESS">
                  <option value="OUTCOME_AWARENESS">Awareness</option>
                  <option value="OUTCOME_TRAFFIC">Traffic</option>
                  <option value="OUTCOME_ENGAGEMENT">Engagement</option>
                  <option value="OUTCOME_LEADS">Leads</option>
                  <option value="OUTCOME_SALES">Sales</option>
                  <option value="OUTCOME_APP_PROMOTION">App promotion</option>
                </select>
              </Field>
              <Field label="Daily budget"><input className="field" name="dailyBudget" type="number" min="1" step="0.01" /></Field>
              <div className="flex items-end"><button className="btn-primary" disabled={busy}>Create paused campaign</button></div>
              <p className="text-xs text-muted md:col-span-2">Campaigns are created paused so an administrator can verify targeting, creatives, compliance, and billing before activation.</p>
            </form>
          )}

          {campaigns === null || busy && campaigns.length === 0 ? <LoadingState /> : campaigns.length === 0 ? (
            <EmptyState title="No campaigns found" description="Create the first paused campaign for this Meta ad account." />
          ) : (
            <section className="grid gap-3 lg:grid-cols-2">
              {campaigns.map((campaign) => {
                const active = campaign.effective_status === "ACTIVE" || campaign.status === "ACTIVE";
                return (
                  <article key={campaign.external_campaign_id} className="rounded-2xl border bg-surface-raised p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-display text-lg font-semibold">{campaign.name}</h2>
                        <p className="mt-1 text-xs text-muted">{campaign.objective?.replaceAll("_", " ") || "Objective unavailable"}</p>
                      </div>
                      <StatusBadge status={campaign.effective_status || campaign.status || "unknown"} />
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-4 border-t pt-4">
                      <p className="text-xs text-muted">
                        {campaign.daily_budget ? `${campaign.daily_budget} daily` : campaign.lifetime_budget ? `${campaign.lifetime_budget} lifetime` : "Ad-set budget"}
                      </p>
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => void setStatus(campaign, active ? "PAUSED" : "ACTIVE")}
                      >
                        {active ? <Pause size={15} /> : <Play size={15} />}
                        {active ? "Pause" : "Activate"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
      {busy && campaigns?.length ? <p className="flex items-center gap-2 text-xs text-muted"><LoaderCircle size={14} className="animate-spin" /> Synchronizing with Meta…</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">{label}</span>{children}</label>;
}
