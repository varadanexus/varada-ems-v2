"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Link2, LoaderCircle, PlugZap, Plus, Radio, RefreshCw, ShieldCheck } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";

type Account = {
  id: string;
  platform: string;
  external_account_id: string;
  display_name: string;
  username: string | null;
  credential_expires_at: string | null;
  status: string;
};

type MetaConnection = {
  id: string;
  external_user_id: string;
  display_name: string;
  credential_expires_at: string | null;
  granted_scopes: string[];
  declined_scopes: string[];
  updated_at: string;
};

type MetaSubscription = {
  account_id: string;
  page_id: string;
  display_name: string;
  category: string | null;
  fan_count: number;
  followers_count: number;
  instagram_business_account: {
    id: string;
    username?: string;
  } | null;
  success: boolean;
};

const META_FEATURES = [
  { label: "Instagram profile and posts", scopes: ["instagram_basic"] },
  { label: "Comments and replies", scopes: ["instagram_manage_comments"] },
  { label: "Content publishing", scopes: ["instagram_content_publish"] },
  { label: "Instagram inbox", scopes: ["instagram_manage_messages"] },
  { label: "Analytics", scopes: ["pages_read_engagement"] },
  { label: "Ads reporting and campaigns", scopes: ["ads_read", "ads_management"] },
] as const;

export function AccountManager() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [connections, setConnections] = useState<MetaConnection[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<MetaSubscription[]>([]);
  const [error, setError] = useState("");
  const [healthError, setHealthError] = useState("");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const activeAccounts = accounts?.filter((account) => account.status !== "disconnected") ?? null;
  const disconnectedAccountCount = accounts?.filter((account) => account.status === "disconnected").length ?? 0;
  const load = useCallback(async () => {
    const [accountResult, connectionResult] = await Promise.allSettled([
      socialEdgeFetch<Account[]>("list_accounts"),
      socialEdgeFetch<MetaConnection[]>("meta_connection_status"),
    ]);
    if (accountResult.status === "fulfilled") {
      setAccounts(accountResult.value);
      setError("");
    } else {
      setError(accountResult.reason instanceof Error ? accountResult.reason.message : "Accounts could not be loaded.");
    }
    if (connectionResult.status === "fulfilled") {
      setConnections(connectionResult.value);
      setHealthError("");
    } else {
      setConnections([]);
      setHealthError(connectionResult.reason instanceof Error ? connectionResult.reason.message : "Meta access status could not be checked.");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connectMeta() {
    setBusy(true);
    try {
      const returnUrl = (() => {
        try {
          const parent = new URL(document.referrer);
          if (parent.pathname.includes("/modules/social-media-manager/")) {
            parent.search = "view=accounts";
            return parent.href;
          }
        } catch {
          // Standalone mode returns to the current accounts page.
        }
        return window.location.href;
      })();
      const result = await socialEdgeFetch<{ url: string }>("connect_url", {
        returnUrl,
      });
      if (window.top && window.top !== window) {
        window.top.postMessage(
          { type: "VARADA_SOCIAL_NAVIGATE", url: result.url },
          new URL(document.referrer).origin,
        );
      } else {
        window.location.assign(result.url);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Meta connection could not start.");
      setBusy(false);
    }
  }

  async function refreshMetaAccess() {
    setBusy(true);
    setHealthError("");
    try {
      const refreshed = await socialEdgeFetch<MetaSubscription[]>("refresh_meta_subscriptions");
      const current = await socialEdgeFetch<MetaConnection[]>("meta_connection_status");
      setSubscriptions(refreshed);
      setConnections(current);
      await load();
    } catch (reason) {
      setHealthError(reason instanceof Error ? reason.message : "Meta access could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectMeta(connection: MetaConnection) {
    const confirmed = window.confirm(
      `Disconnect Meta authorization for ${connection.display_name}?\n\nThis only removes the active Meta token from Nexus Social. EMS users, drafts, schedules, posts, analytics history, and audit logs will be kept.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setHealthError("");
    try {
      await socialEdgeFetch<{ disconnected: boolean }>("disconnect", {
        connectionId: connection.id,
      });
      setSubscriptions([]);
      await load();
    } catch (reason) {
      setHealthError(reason instanceof Error ? reason.message : "Meta connection could not be disconnected.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      await socialEdgeFetch("add_account", {
        platform: values.get("platform"),
        externalAccountId: values.get("externalAccountId"),
        displayName: values.get("displayName"),
        username: values.get("username") || undefined,
        accessToken: values.get("accessToken"),
      });
      setManual(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Channel infrastructure"
        title="Social accounts"
        description="Connect multiple business accounts. Tokens are encrypted at rest and never returned to the browser."
        icon={Radio}
        actions={<>
          <button onClick={connectMeta} disabled={busy} className="btn-primary">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Link2 size={16} />} Connect Meta</button>
          <button onClick={() => setManual((value) => !value)} className="btn-secondary"><Plus size={16} /> Add manually</button>
        </>}
      />
      {error && <ErrorState message={error} retry={load} />}
      {accounts && accounts.length > 0 && (
        <section className="rounded-2xl border bg-surface-raised p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <div className="flex items-center gap-2 text-accent">
                <ShieldCheck size={18} />
                <h2 className="font-display text-lg font-semibold text-foreground">Meta connection health</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
                This checks the existing Meta connection and Page subscriptions. It does not create a new Facebook Page, Instagram profile, or ad account.
              </p>
            </div>
            <button onClick={refreshMetaAccess} disabled={busy} className="btn-secondary shrink-0">
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh access
            </button>
          </div>
          {healthError && <div className="mt-4"><ErrorState message={healthError} retry={refreshMetaAccess} /></div>}
          {connections === null ? (
            <div className="mt-5 text-sm text-muted">Checking Meta access…</div>
          ) : connections.length === 0 ? (
            <p className="mt-5 text-sm text-muted">No active Meta authorization was returned. Use Connect Meta to authorize the existing business assets.</p>
          ) : (
            <div className="mt-5 space-y-4">
              {connections.map((connection) => {
                const granted = new Set(connection.granted_scopes);
                return (
                  <div key={connection.id} className="rounded-xl border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{connection.display_name}</p>
                        <p className="mt-1 text-xs text-muted">Meta authorization · updated {new Date(connection.updated_at).toLocaleString("en-IN")}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                          <CheckCircle2 size={13} /> Linked
                        </span>
                        <button
                          type="button"
                          onClick={() => disconnectMeta(connection)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200 transition hover:border-amber-300 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Disconnect only the active Meta authorization so you can record a fresh Meta Login flow for App Review."
                        >
                          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <PlugZap size={13} />}
                          Disconnect Meta
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {META_FEATURES.map((feature) => {
                        const ready = feature.scopes.every((scope) => granted.has(scope));
                        return (
                          <div key={feature.label} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                            <span>{feature.label}</span>
                            <span className={ready ? "font-semibold text-emerald-300" : "text-amber-300"}>{ready ? "Scope granted" : "Permission needed"}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted">
                      A granted scope confirms token access. Meta App Review and feature capability approval can still be required before Instagram inbox or other restricted operations work in production.
                    </p>
                    {connection.declined_scopes.length > 0 && (
                      <p className="mt-2 text-xs text-amber-300">Declined: {connection.declined_scopes.join(", ")}</p>
                    )}
                  </div>
                );
              })}
              {subscriptions.map((subscription) => (
                <div key={subscription.account_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{subscription.display_name}</p>
                    <p className="mt-1 text-xs text-muted">
                      Facebook Page {subscription.page_id}
                      {subscription.instagram_business_account?.username ? ` · Instagram @${subscription.instagram_business_account.username}` : ""}
                    </p>
                  </div>
                  <span className={subscription.success ? "text-emerald-300" : "text-amber-300"}>
                    {subscription.success ? "Webhook subscribed" : "Subscription needs attention"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {manual && (
        <form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-surface p-5 md:grid-cols-2">
          <Field label="Platform"><select name="platform" className="field" required>{["instagram","facebook","linkedin","x","threads","pinterest","google_business","youtube_community"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></Field>
          <Field label="Display name"><input className="field" name="displayName" required /></Field>
          <Field label="External account ID"><input className="field" name="externalAccountId" required /></Field>
          <Field label="Username"><input className="field" name="username" /></Field>
          <div className="md:col-span-2"><Field label="Access token"><input className="field" name="accessToken" type="password" autoComplete="new-password" required /></Field></div>
          <div className="md:col-span-2"><button className="btn-primary" disabled={busy}>Save encrypted connection</button></div>
        </form>
      )}
      {!activeAccounts ? <LoadingState /> : activeAccounts.length === 0 ? (
        <EmptyState title="No social accounts connected" description="Connect Meta for Instagram and Facebook publishing, or add another platform for n8n-driven publishing." />
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activeAccounts.map((account) => (
            <article key={account.id} className="rounded-2xl border bg-surface-raised p-5">
              <div className="flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-accent-soft font-bold uppercase text-accent">{account.platform.slice(0, 2)}</span>
                <StatusBadge status={account.status} />
              </div>
              <h2 className="mt-5 font-display text-lg font-semibold">{account.display_name}</h2>
              <p className="mt-1 text-sm capitalize text-muted">{account.platform.replaceAll("_", " ")}{account.username ? ` · @${account.username}` : ""}</p>
              <p className="mt-4 break-all text-xs text-muted">ID {account.external_account_id}</p>
              <p className="mt-2 text-xs text-muted">Token {account.credential_expires_at ? `expires ${new Date(account.credential_expires_at).toLocaleDateString("en-IN")}` : "expiry not supplied"}</p>
            </article>
          ))}
        </section>
      )}
      {disconnectedAccountCount > 0 && (
        <p className="text-xs leading-5 text-muted">
          {disconnectedAccountCount} disconnected Meta account record{disconnectedAccountCount === 1 ? "" : "s"} hidden from this active workspace and kept only for audit history.
        </p>
      )}
      <a href="https://developers.facebook.com/docs/instagram-platform/content-publishing/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted">Meta publishing requirements <ExternalLink size={12} /></a>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">{label}</span>{children}</label>;
}
