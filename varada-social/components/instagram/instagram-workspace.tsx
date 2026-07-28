"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Camera, ExternalLink, Eye, EyeOff, Film, Grid3X3, Heart, LoaderCircle,
  MessageCircle, RefreshCw, Send, Share2, Trash2, Users, X,
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
  id: string; account_id: string; account_username: string | null; caption: string; media_type: string;
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
type InstagramComment = {
  id: string; text: string; timestamp: string; username: string;
  like_count: number; hidden: boolean; parent_id?: string;
  replies?: { data?: InstagramComment[] };
};
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export function InstagramWorkspace() {
  const [data, setData] = useState<InstagramData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"posts" | "reels">("posts");
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [comments, setComments] = useState<InstagramComment[] | null>(null);
  const [commentBusy, setCommentBusy] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [replyText, setReplyText] = useState("");
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

  async function loadComments(post: InstagramPost) {
    setSelectedPost(post);
    setComments(null);
    setReplyTo("");
    setReplyText("");
    try {
      const result = await socialEdgeFetch<{ comments: InstagramComment[] }>("instagram_comments", {
        accountId: post.account_id,
        mediaId: post.id,
      });
      setComments(result.comments);
    } catch (reason) {
      setComments([]);
      setError(reason instanceof Error ? reason.message : "Comments could not be loaded.");
    }
  }

  async function commentAction(comment: InstagramComment, operation: "reply" | "hide" | "unhide" | "delete") {
    if (!selectedPost) return;
    if (operation === "delete" && !window.confirm("Delete this Instagram comment? This cannot be undone.")) return;
    const key = `${comment.id}:${operation}`;
    setCommentBusy(key);
    try {
      await socialEdgeFetch("instagram_comment_action", {
        accountId: selectedPost.account_id,
        mediaId: selectedPost.id,
        commentId: comment.id,
        operation,
        message: operation === "reply" ? replyText : undefined,
      });
      setReplyTo("");
      setReplyText("");
      await loadComments(selectedPost);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Instagram comment action failed.");
    } finally {
      setCommentBusy("");
    }
  }

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
          <div className="mt-4 inline-flex rounded-xl border bg-surface p-1">
            <button onClick={() => setTab("posts")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === "posts" ? "bg-accent-soft text-accent" : "text-muted"}`}><Grid3X3 size={15} /> Posts</button>
            <button onClick={() => setTab("reels")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === "reels" ? "bg-accent-soft text-accent" : "text-muted"}`}><Film size={15} /> Reels</button>
          </div>
          {data.posts.length === 0 ? <div className="mt-4"><EmptyState title="No Instagram posts returned" description="Publish content on the connected professional account, then synchronize again." /></div> : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.posts.filter((post) => tab === "posts" || post.media_product_type === "REELS").map((post) => (
                <article key={post.id} onClick={() => void loadComments(post)} className="cursor-pointer overflow-hidden rounded-2xl border bg-surface-raised transition hover:-translate-y-0.5 hover:border-accent/40">
                  {post.thumbnail_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={post.thumbnail_url} alt="" className="aspect-square w-full object-cover" />
                    : <div className="grid aspect-square place-items-center bg-background text-muted"><Camera size={30} /></div>}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-wider text-accent">{post.media_product_type}</span><a href={post.permalink} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-muted hover:text-accent" aria-label="Open on Instagram"><ExternalLink size={15} /></a></div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6">{post.caption || "Instagram post"}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted"><span className="flex items-center gap-1"><Heart size={13} /> {compact.format(post.like_count)}</span><span className="flex items-center gap-1"><MessageCircle size={13} /> {compact.format(post.comments_count)}</span><span className="flex items-center gap-1"><Eye size={13} /> {compact.format(post.reach || post.views)}</span></div>
                    <p className="mt-3 text-[11px] text-muted">{new Date(post.timestamp).toLocaleString("en-IN")}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        {selectedPost && (
          <div className="fixed inset-0 z-[80] grid bg-black/80 p-3 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true">
            <div className="mx-auto grid h-full w-full max-w-6xl overflow-hidden rounded-2xl border bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
              <div className="grid min-h-0 place-items-center bg-black">
                {selectedPost.media_product_type === "REELS" && selectedPost.media_url ? (
                  <video src={selectedPost.media_url} controls className="max-h-full max-w-full" />
                ) : selectedPost.media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedPost.media_url} alt="" className="max-h-full max-w-full object-contain" />
                ) : <Camera size={40} className="text-muted" />}
              </div>
              <aside className="flex min-h-0 flex-col border-l">
                <header className="flex items-center gap-3 border-b p-4">
                  <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent"><Camera size={18} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold">@{selectedPost.account_username}</p><p className="text-xs text-muted">{selectedPost.media_product_type}</p></div>
                  <a href={selectedPost.permalink} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted hover:bg-surface" title="Edit or delete this post in Instagram"><ExternalLink size={18} /></a>
                  <button onClick={() => setSelectedPost(null)} className="rounded-lg p-2 text-muted hover:bg-surface" aria-label="Close"><X size={19} /></button>
                </header>
                <div className="border-b p-4">
                  <p className="whitespace-pre-wrap text-sm leading-6">{selectedPost.caption || "Instagram post"}</p>
                  <div className="mt-4 flex gap-5 text-xs text-muted">
                    <span className="flex items-center gap-1"><Heart size={14} /> {compact.format(selectedPost.like_count)}</span>
                    <span className="flex items-center gap-1"><MessageCircle size={14} /> {compact.format(selectedPost.comments_count)}</span>
                    <span className="flex items-center gap-1"><Eye size={14} /> {compact.format(selectedPost.reach || selectedPost.views)}</span>
                  </div>
                  <p className="mt-3 rounded-lg border border-accent/15 bg-accent-soft p-2 text-[11px] text-muted">Meta does not allow third-party apps to edit captions or delete published Instagram media. Use the Instagram link above for those two actions.</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <h3 className="text-sm font-semibold">Comments</h3>
                  {comments === null ? <div className="grid h-32 place-items-center"><LoaderCircle className="animate-spin text-accent" /></div> : comments.length === 0 ? <p className="mt-5 text-sm text-muted">No comments on this post.</p> : (
                    <div className="mt-4 space-y-5">
                      {comments.map((comment) => (
                        <CommentThread
                          key={comment.id}
                          comment={comment}
                          replyTo={replyTo}
                          replyText={replyText}
                          busy={commentBusy}
                          onReplyOpen={() => { setReplyTo(comment.id); setReplyText(""); }}
                          onReplyText={setReplyText}
                          onAction={(operation) => void commentAction(comment, operation)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </>}
    </div>
  );
}

function CommentThread({ comment, replyTo, replyText, busy, onReplyOpen, onReplyText, onAction }: {
  comment: InstagramComment; replyTo: string; replyText: string; busy: string;
  onReplyOpen: () => void; onReplyText: (value: string) => void;
  onAction: (operation: "reply" | "hide" | "unhide" | "delete") => void;
}) {
  return <div className={comment.hidden ? "opacity-55" : ""}>
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-accent">{(comment.username || "IG").slice(0, 2).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5"><b>@{comment.username || "instagram"}</b> {comment.text}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
          <span>{new Date(comment.timestamp).toLocaleString("en-IN")}</span>
          <button onClick={onReplyOpen} className="font-semibold hover:text-accent">Reply</button>
          <button onClick={() => onAction(comment.hidden ? "unhide" : "hide")} disabled={busy.startsWith(comment.id)} className="flex items-center gap-1 font-semibold hover:text-accent"><EyeOff size={11} /> {comment.hidden ? "Show" : "Hide"}</button>
          <button onClick={() => onAction("delete")} disabled={busy.startsWith(comment.id)} className="flex items-center gap-1 font-semibold text-red-300 hover:text-red-200"><Trash2 size={11} /> Delete</button>
        </div>
        {(comment.replies?.data || []).map((reply) => <div key={reply.id} className="mt-3 border-l pl-3 text-sm"><p><b>@{reply.username || "instagram"}</b> {reply.text}</p><p className="mt-1 text-[10px] text-muted">{new Date(reply.timestamp).toLocaleString("en-IN")}</p></div>)}
        {replyTo === comment.id && <div className="mt-3 flex gap-2"><input value={replyText} onChange={(event) => onReplyText(event.target.value)} className="field min-w-0 flex-1" placeholder={`Reply to @${comment.username || "instagram"}`} maxLength={1000} /><button onClick={() => onAction("reply")} disabled={!replyText.trim() || busy === `${comment.id}:reply`} className="btn-primary px-3" aria-label="Send reply">{busy === `${comment.id}:reply` ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}</button></div>}
      </div>
    </div>
  </div>;
}
