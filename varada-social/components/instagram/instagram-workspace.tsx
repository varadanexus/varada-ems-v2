"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Camera, ExternalLink, Eye, Heart, LoaderCircle, MessageCircle,
  RefreshCw, Share2, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

type InstagramAccount = {
  id: string; display_name: string; username: string | null; status: string;
  profile_picture_url: string | null; followers_count: number; follows_count: number;
  media_count: number; biography: string | null; website: string | null; page_name: string | null;
};
type InstagramPost = {
  id: string; account_username: string | null; caption: string; media_type: string;
  media_product_type: string; media_url: string | null; thumbnail_url: string | null;
  permalink: string; timestamp: string; like_count: number; comments_count: number;
  reach: number; views: number; saved: number; shares: number; total_interactions: number;
};
type InstagramData = {
  accounts: InstagramAccount[]; posts: InstagramPost[];
  totals: {
    followers: number; likes: number; comments: number; shares: number; saves: number;
    reach: number; views: number; interactions: number; engagementRate: number;
  };
  syncedAt: string;
};
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export function InstagramWorkspace() {
  const [data, setData] = useState<InstagramData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await socialEdgeFetch<InstagramData>("instagram_workspace", { limit: 50 }));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Instagram could not be synchronized.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Instagram Business"
        title="Instagram"
        description="View connected profiles, live posts and post-level insights directly from Meta."
        icon={Camera}
        actions={<button onClick={load} disabled={busy} className="btn-secondary">
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sync from Instagram
        </button>}
      />
      {error && <ErrorState message={error} retry={load} />}
      {!data ? <LoadingState /> : data.accounts.length === 0 ? (
        <EmptyState title="No Instagram Business account linked" description="Open Social Accounts and complete Connect Meta. The Instagram account must be professional and linked to a Facebook Page." />
      ) : <>
        <section className="grid gap-4 xl:grid-cols-2">
          {data.accounts.map((account) => (
            <article key={account.id} className="flex gap-4 rounded-2xl border bg-surface-raised p-5">
              {account.profile_picture_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={account.profile_picture_url} alt="" className="size-20 rounded-2xl object-cover" />
                : <span className="grid size-20 place-items-center rounded-2xl bg-accent-soft text-accent"><Camera size={30} /></span>}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-display text-xl font-semibold">{account.display_name}</h2><p className="text-sm text-accent">@{account.username || "instagram"}</p></div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">Linked</span>
                </div>
                {account.biography && <p className="mt-3 text-sm leading-6 text-muted">{account.biography}</p>}
                <div className="mt-4 flex gap-5 text-sm"><span><b>{compact.format(account.followers_count)}</b> followers</span><span><b>{compact.format(account.media_count)}</b> posts</span></div>
              </div>
            </article>
          ))}
        </section>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {([
            ["Followers", data.totals.followers, Users], ["Reach", data.totals.reach, Eye],
            ["Likes", data.totals.likes, Heart], ["Comments", data.totals.comments, MessageCircle],
            ["Shares + saves", data.totals.shares + data.totals.saves, Share2],
          ] as Array<[string, number, LucideIcon]>).map(([label, value, Icon]) => (
            <article key={String(label)} className="rounded-2xl border bg-surface-raised p-5">
              <div className="flex justify-between text-xs text-muted"><span>{String(label)}</span><Icon size={16} className="text-accent" /></div>
              <p className="mt-4 font-display text-2xl font-semibold">{compact.format(Number(value))}</p>
            </article>
          ))}
        </section>
        <section>
          <div className="flex items-end justify-between gap-3">
            <div><h2 className="font-display text-xl font-semibold">Published posts</h2><p className="mt-1 text-sm text-muted">Live media and available insights from the Instagram Graph API.</p></div>
            <p className="text-xs text-muted">Synced {new Date(data.syncedAt).toLocaleString("en-IN")}</p>
          </div>
          {data.posts.length === 0 ? <div className="mt-4"><EmptyState title="No Instagram posts returned" description="Publish content on the connected professional account, then synchronize again." /></div> : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.posts.map((post) => (
                <article key={post.id} className="overflow-hidden rounded-2xl border bg-surface-raised">
                  {post.thumbnail_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={post.thumbnail_url} alt="" className="aspect-square w-full object-cover" />
                    : <div className="grid aspect-square place-items-center bg-background text-muted"><Camera size={30} /></div>}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-wider text-accent">{post.media_product_type}</span><a href={post.permalink} target="_blank" rel="noreferrer" className="text-muted hover:text-accent" aria-label="Open on Instagram"><ExternalLink size={15} /></a></div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6">{post.caption || "Instagram post"}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted"><span className="flex items-center gap-1"><Heart size={13} /> {compact.format(post.like_count)}</span><span className="flex items-center gap-1"><MessageCircle size={13} /> {compact.format(post.comments_count)}</span><span className="flex items-center gap-1"><Eye size={13} /> {compact.format(post.reach || post.views)}</span></div>
                    <p className="mt-3 text-[11px] text-muted">{new Date(post.timestamp).toLocaleString("en-IN")}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </>}
    </div>
  );
}
