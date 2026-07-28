"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, LoaderCircle, Plus, Radio } from "lucide-react";
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

export function AccountManager() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await socialEdgeFetch<Account[]>("list_accounts");
      setAccounts(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Accounts could not be loaded.");
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
      {!accounts ? <LoadingState /> : accounts.length === 0 ? (
        <EmptyState title="No social accounts connected" description="Connect Meta for Instagram and Facebook publishing, or add another platform for n8n-driven publishing." />
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
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
      <a href="https://developers.facebook.com/docs/instagram-platform/content-publishing/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted">Meta publishing requirements <ExternalLink size={12} /></a>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">{label}</span>{children}</label>;
}
