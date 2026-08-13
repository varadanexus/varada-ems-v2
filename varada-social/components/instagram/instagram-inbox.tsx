"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Inbox, LoaderCircle, MessageCircle, RefreshCw, Search, Send,
  ShieldCheck,
} from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

type MessageAttachment = {
  id?: string; mime_type?: string; name?: string;
  image_data?: { url?: string }; video_data?: { url?: string }; file_url?: string;
};
type Message = {
  id: string; created_time: string; message?: string;
  from?: { id?: string; name?: string; username?: string };
  attachments?: { data?: MessageAttachment[] };
};
type Conversation = {
  id: string; updated_time: string | null;
  contact: { id: string | null; name: string; username: string | null };
  latest_message: string; messages: Message[];
};
type InboxData = {
  account: {
    id: string; external_account_id: string; display_name: string;
    username: string | null; profile_picture_url: string | null;
  };
  conversations: Conversation[];
  syncedAt: string;
};

export function InstagramInbox() {
  const [data, setData] = useState<InboxData | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState("");
  const messageListRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) setBusy("sync");
    try {
      const result = await socialEdgeFetch<InboxData>("instagram_inbox", { limit: 50 });
      setData(result);
      setSelected((current) =>
        current
          ? result.conversations.find((item) => item.id === current.id) || null
          : result.conversations[0] || null,
      );
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Instagram Inbox could not be loaded.");
    } finally {
      if (!silent) setBusy("");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const sync = window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ silent: true });
    }, 10_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(sync);
    };
  }, [load]);

  async function openConversation(conversation: Conversation) {
    setSelected(conversation);
    setBusy("thread");
    try {
      const result = await socialEdgeFetch<Conversation>("instagram_conversation", {
        accountId: data?.account.id,
        conversationId: conversation.id,
      });
      setSelected(result);
      setData((current) => current ? {
        ...current,
        conversations: current.conversations.map((item) => item.id === result.id ? result : item),
      } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conversation could not be loaded.");
    } finally {
      setBusy("");
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected?.contact.id || !draft.trim() || !data) return;
    setBusy("send");
    try {
      await socialEdgeFetch("instagram_send_message", {
        accountId: data.account.id,
        conversationId: selected.id,
        recipientId: selected.contact.id,
        message: draft,
      });
      setDraft("");
      await openConversation(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Instagram reply could not be sent.");
    } finally {
      setBusy("");
    }
  }

  const conversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data?.conversations || [];
    return (data?.conversations || []).filter((item) =>
      `${item.contact.name} ${item.contact.username || ""} ${item.latest_message}`
        .toLowerCase()
        .includes(term),
    );
  }, [data, query]);
  const messages = [...(selected?.messages || [])].reverse();
  const selectedId = selected?.id;
  const selectedMessageCount = selected?.messages?.length || 0;
  const approvalPending = error.includes("awaiting Meta approval");

  useEffect(() => {
    if (!selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      const messageList = messageListRef.current;
      if (messageList) messageList.scrollTop = messageList.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, selectedMessageCount]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Instagram messaging"
        title="Inbox"
        description="Read and reply to Instagram Business conversations without leaving EMS."
        icon={Inbox}
        actions={<button onClick={() => void load()} disabled={busy === "sync"} className="btn-secondary">
          {busy === "sync" ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sync inbox
        </button>}
      />
      {error && (approvalPending ? (
        <section className="rounded-2xl border border-accent/35 bg-accent-soft/30 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <ShieldCheck size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Meta review in progress</p>
              <h2 className="mt-1 text-lg font-semibold">Instagram Inbox is configured</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Page access and Instagram Connected Tools are ready. Live conversations will appear here after Meta grants Advanced Access for <code>instagram_manage_messages</code>.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void load()} disabled={busy === "sync"} className="btn-secondary">
                  {busy === "sync" ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Check again
                </button>
                <a href="/accounts?embedded=1" className="btn-primary">Reconnect Meta after approval</a>
              </div>
            </div>
          </div>
        </section>
      ) : <ErrorState message={error} retry={load} />)}
      {!data && !error ? <LoadingState /> : !data ? null : data.conversations.length === 0 ? (
        <EmptyState title="No Instagram conversations returned" description="Enable Connected Tools in Instagram Message Controls, then send a message to this professional account and synchronize again." />
      ) : (
        <section className="grid h-[min(720px,calc(100vh-190px))] min-h-[560px] overflow-hidden rounded-2xl border bg-surface-raised lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className={`${selected ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r`}>
            <header className="border-b p-4">
              <div className="flex items-center gap-3">
                {data.account.profile_picture_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={data.account.profile_picture_url} alt="" className="size-10 rounded-full object-cover" />
                  : <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent"><MessageCircle size={17} /></span>}
                <div className="min-w-0"><p className="truncate font-semibold">{data.account.display_name}</p><p className="text-xs text-accent">@{data.account.username}</p></div>
              </div>
              <label className="relative mt-4 block">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="field pl-9" placeholder="Search conversations" />
              </label>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversations.map((conversation) => (
                <button key={conversation.id} onClick={() => void openConversation(conversation)} className={`flex w-full gap-3 border-b p-4 text-left transition hover:bg-accent-soft ${selected?.id === conversation.id ? "bg-accent-soft" : ""}`}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-sm font-bold text-accent">{conversation.contact.name.slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2"><b className="truncate text-sm">{conversation.contact.name}</b><small className="shrink-0 text-[10px] text-muted">{conversation.updated_time ? new Date(conversation.updated_time).toLocaleDateString("en-IN") : ""}</small></span>
                    <span className="mt-1 block truncate text-xs text-muted">{conversation.latest_message || "Instagram conversation"}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <main className={`${selected ? "flex" : "hidden lg:flex"} min-h-0 flex-col`}>
            {selected && <>
              <header className="flex h-16 items-center gap-3 border-b px-4">
                <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-muted lg:hidden" aria-label="Back"><ArrowLeft size={18} /></button>
                <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">{selected.contact.name.slice(0, 2).toUpperCase()}</span>
                <div><p className="font-semibold">{selected.contact.name}</p><p className="text-xs text-muted">{selected.contact.username ? `@${selected.contact.username}` : "Instagram user"}</p></div>
                {busy === "thread" && <LoaderCircle size={16} className="ml-auto animate-spin text-accent" />}
              </header>
              <div ref={messageListRef} className="min-h-0 flex-1 overflow-y-auto bg-background p-4 sm:p-6">
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
                  {messages.map((message) => {
                    const mine = String(message.from?.id || "") === String(data.account.external_account_id);
                    return <div key={message.id} className={`max-w-[82%] ${mine ? "self-end" : "self-start"}`}>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-6 ${mine ? "rounded-br-sm bg-accent text-[#100c05]" : "rounded-bl-sm border bg-surface-raised"}`}>
                        {message.message && <p className="whitespace-pre-wrap">{message.message}</p>}
                        {(message.attachments?.data || []).map((attachment, index) => <Attachment key={attachment.id || index} attachment={attachment} />)}
                      </div>
                      <p className={`mt-1 text-[10px] text-muted ${mine ? "text-right" : ""}`}>{message.created_time ? new Date(message.created_time).toLocaleString("en-IN") : ""}</p>
                    </div>;
                  })}
                </div>
              </div>
              <form onSubmit={send} className="flex gap-2 border-t bg-surface p-3 sm:p-4">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="field min-h-11 flex-1 resize-none" rows={1} maxLength={1000} placeholder={`Message ${selected.contact.name}`} />
                <button className="btn-primary self-end px-4" disabled={!draft.trim() || busy === "send"}>{busy === "send" ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />} <span className="hidden sm:inline">Send</span></button>
              </form>
            </>}
          </main>
        </section>
      )}
    </div>
  );
}

function Attachment({ attachment }: { attachment: MessageAttachment }) {
  const image = attachment.image_data?.url;
  const video = attachment.video_data?.url;
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className="mt-2 max-h-72 rounded-xl object-contain" />;
  }
  if (video) return <video src={video} controls className="mt-2 max-h-72 rounded-xl" />;
  if (attachment.file_url) return <a href={attachment.file_url} target="_blank" rel="noreferrer" className="mt-2 block underline">{attachment.name || "Open attachment"}</a>;
  return null;
}
