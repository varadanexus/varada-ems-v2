"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Megaphone, Pause, Play, Plus, RefreshCw, X } from "lucide-react";
import { socialEdgeFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";

type AdAccount = { external_account_id: string; name: string; currency: string | null; timezone_name: string | null; account_status: number | null };
type Campaign = { external_campaign_id: string; name: string; objective: string | null; status: string | null; effective_status: string | null; daily_budget: number | null; lifetime_budget: number | null };
type Draft = {
  name: string; objective: string; buyingType: string; specialCategory: string; budgetLevel: "campaign" | "adset";
  budgetType: "daily" | "lifetime"; budget: string; bidStrategy: string; costCap: string; startTime: string; endTime: string;
  ageMin: string; ageMax: string; genders: string; countries: string; locations: string; audienceType: string;
  placements: "advantage" | "manual"; placementList: string[]; optimizationGoal: string; attribution: string;
  destinationUrl: string; primaryText: string; headline: string; description: string; callToAction: string; pixelId: string; urlParameters: string;
};

const initialDraft: Draft = {
  name: "", objective: "OUTCOME_LEADS", buyingType: "AUCTION", specialCategory: "NONE", budgetLevel: "campaign",
  budgetType: "daily", budget: "500", bidStrategy: "LOWEST_COST_WITHOUT_CAP", costCap: "", startTime: "", endTime: "",
  ageMin: "18", ageMax: "65", genders: "all", countries: "IN", locations: "", audienceType: "broad",
  placements: "advantage", placementList: ["facebook_feed", "instagram_feed", "instagram_stories", "instagram_reels"],
  optimizationGoal: "LEAD_GENERATION", attribution: "7d_click_1d_view", destinationUrl: "", primaryText: "", headline: "", description: "",
  callToAction: "LEARN_MORE", pixelId: "", urlParameters: "utm_source=meta&utm_medium=paid_social",
};

const steps = ["Campaign", "Budget & schedule", "Audience & placements", "Ad & review"];
const objectives = [
  ["OUTCOME_AWARENESS", "Awareness", "Reach people likely to remember your ads"],
  ["OUTCOME_TRAFFIC", "Traffic", "Send people to a destination"],
  ["OUTCOME_ENGAGEMENT", "Engagement", "Get messages, video views or interactions"],
  ["OUTCOME_LEADS", "Leads", "Collect leads for your business"],
  ["OUTCOME_SALES", "Sales", "Find people likely to purchase"],
  ["OUTCOME_APP_PROMOTION", "App promotion", "Drive app installs and events"],
];

export function CampaignManager() {
  const [accounts, setAccounts] = useState<AdAccount[] | null>(null);
  const [selected, setSelected] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const account = accounts?.find((item) => item.external_account_id === selected);
  const money = useMemo(() => new Intl.NumberFormat("en-IN", { style: "currency", currency: account?.currency || "INR", maximumFractionDigits: 0 }), [account?.currency]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const loadAccounts = useCallback(async () => {
    try {
      const rows = await socialEdgeFetch<AdAccount[]>("list_ad_accounts");
      setAccounts(rows); setSelected((current) => current || rows[0]?.external_account_id || ""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ad accounts could not be loaded."); setAccounts([]); }
  }, []);
  const loadCampaigns = useCallback(async (adAccountId: string) => {
    if (!adAccountId) return setCampaigns([]);
    setBusy(true);
    try { setCampaigns(await socialEdgeFetch<Campaign[]>("list_campaigns", { adAccountId })); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Campaigns could not be loaded."); setCampaigns([]); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadAccounts(), 0); return () => window.clearTimeout(timer); }, [loadAccounts]);
  useEffect(() => { if (!selected) return; const timer = window.setTimeout(() => void loadCampaigns(selected), 0); return () => window.clearTimeout(timer); }, [loadCampaigns, selected]);

  function openBuilder() { setDraft(initialDraft); setStep(0); setError(""); setCreating(true); }
  function validate(currentStep = step) {
    if (currentStep === 0 && !draft.name.trim()) return "Enter a campaign name.";
    if (currentStep === 1 && draft.budgetLevel === "campaign" && (!Number(draft.budget) || Number(draft.budget) <= 0)) return "Enter a valid campaign budget.";
    if (currentStep === 1 && draft.endTime && draft.startTime && new Date(draft.endTime) <= new Date(draft.startTime)) return "End time must be after the start time.";
    if (currentStep === 2 && Number(draft.ageMax) < Number(draft.ageMin)) return "Maximum age must be greater than minimum age.";
    if (currentStep === 2 && !draft.countries.trim()) return "Add at least one country code.";
    return "";
  }
  function next() { const message = validate(); if (message) return setError(message); setError(""); setStep((value) => Math.min(value + 1, steps.length - 1)); }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = validate(0) || validate(1) || validate(2); if (message) return setError(message);
    setBusy(true); setError("");
    try {
      await socialEdgeFetch("create_campaign", {
        adAccountId: selected, name: draft.name.trim(), objective: draft.objective, buyingType: draft.buyingType,
        specialAdCategories: draft.specialCategory === "NONE" ? [] : [draft.specialCategory],
        dailyBudget: draft.budgetLevel === "campaign" && draft.budgetType === "daily" ? draft.budget : undefined,
        lifetimeBudget: draft.budgetLevel === "campaign" && draft.budgetType === "lifetime" ? draft.budget : undefined,
        bidStrategy: draft.bidStrategy, costCap: draft.costCap || undefined, startTime: draft.startTime || undefined, endTime: draft.endTime || undefined,
        advancedPlan: { budgetLevel: draft.budgetLevel, audience: { ageMin: draft.ageMin, ageMax: draft.ageMax, genders: draft.genders, countries: draft.countries.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean), locations: draft.locations, audienceType: draft.audienceType }, placements: { type: draft.placements, selected: draft.placementList }, optimizationGoal: draft.optimizationGoal, attribution: draft.attribution, creative: { destinationUrl: draft.destinationUrl, primaryText: draft.primaryText, headline: draft.headline, description: draft.description, callToAction: draft.callToAction }, tracking: { pixelId: draft.pixelId, urlParameters: draft.urlParameters } },
        status: "PAUSED",
      });
      setCreating(false); await loadCampaigns(selected);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Campaign could not be created."); }
    finally { setBusy(false); }
  }

  async function setStatus(campaign: Campaign, status: "ACTIVE" | "PAUSED") {
    setBusy(true); try { await socialEdgeFetch("update_campaign", { campaignId: campaign.external_campaign_id, status }); await loadCampaigns(selected); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Campaign could not be updated."); } finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Meta Marketing API" title="Ads campaigns" description="Plan, create, review, and control Meta advertising from the EMS." icon={Megaphone} actions={<>
      <button className="btn-secondary" disabled={busy} onClick={() => void loadAccounts()}><RefreshCw size={16} className={busy ? "animate-spin" : ""} /> Sync</button>
      <button className="btn-primary" disabled={!selected || busy} onClick={creating ? () => setCreating(false) : openBuilder}>{creating ? <X size={16} /> : <Plus size={16} />} {creating ? "Close builder" : "New campaign"}</button>
    </>} />
    {error && <ErrorState message={error} />}
    {accounts === null ? <LoadingState /> : accounts.length === 0 ? <EmptyState title="No Meta ad accounts available" description="Connect Meta from Social Accounts and grant ads_management and ads_read." /> : <>
      <section className="rounded-2xl border bg-surface p-5"><Field label="Ad account"><select className="field max-w-2xl" value={selected} onChange={(e) => setSelected(e.target.value)}>{accounts.map((item) => <option key={item.external_account_id} value={item.external_account_id}>{item.name} · {item.external_account_id} · {item.currency || "currency unavailable"}</option>)}</select></Field></section>
      {creating && <form onSubmit={createCampaign} className="overflow-hidden rounded-2xl border bg-surface">
        <div className="border-b px-5 py-4"><div className="grid gap-2 md:grid-cols-4">{steps.map((label, index) => <button type="button" key={label} onClick={() => index <= step && setStep(index)} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${step === index ? "border-accent bg-accent/10 text-foreground" : index < step ? "border-emerald-400/25 text-emerald-300" : "text-muted"}`}><span className="grid h-6 w-6 place-items-center rounded-full border text-xs">{index < step ? <Check size={13} /> : index + 1}</span>{label}</button>)}</div></div>
        <div className="grid min-h-[520px] lg:grid-cols-[1fr_320px]">
          <div className="space-y-6 p-6">
            {step === 0 && <><Section title="Campaign setup" description="Choose the business outcome and campaign-level controls."><div className="grid gap-4 md:grid-cols-2"><Field label="Campaign name"><input className="field" value={draft.name} onChange={(e) => update("name", e.target.value)} maxLength={180} placeholder="Q4 Lead Generation · India" /></Field><Field label="Buying type"><select className="field" value={draft.buyingType} onChange={(e) => update("buyingType", e.target.value)}><option value="AUCTION">Auction</option><option value="RESERVED">Reservation</option></select></Field></div></Section><Section title="Campaign objective" description="Meta optimizes delivery around the selected outcome."><div className="grid gap-3 md:grid-cols-2">{objectives.map(([value, label, copy]) => <button type="button" key={value} onClick={() => update("objective", value)} className={`rounded-xl border p-4 text-left ${draft.objective === value ? "border-accent bg-accent/10" : "bg-background"}`}><strong className="block">{label}</strong><span className="mt-1 block text-xs leading-5 text-muted">{copy}</span></button>)}</div></Section><Section title="Special ad categories" description="Required for credit, employment, housing, and social-issue advertising."><Field label="Category"><select className="field max-w-xl" value={draft.specialCategory} onChange={(e) => update("specialCategory", e.target.value)}><option value="NONE">None</option><option value="CREDIT">Credit</option><option value="EMPLOYMENT">Employment</option><option value="HOUSING">Housing</option><option value="ISSUES_ELECTIONS_POLITICS">Social issues, elections or politics</option></select></Field></Section></>}
            {step === 1 && <><Section title="Budget strategy" description="Use Advantage campaign budget or control spend later at ad-set level."><div className="grid gap-3 md:grid-cols-2"><Choice active={draft.budgetLevel === "campaign"} title="Campaign budget" copy="Meta distributes budget across ad sets" onClick={() => update("budgetLevel", "campaign")} /><Choice active={draft.budgetLevel === "adset"} title="Ad set budget" copy="Set independent budgets per audience" onClick={() => update("budgetLevel", "adset")} /></div>{draft.budgetLevel === "campaign" && <div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="Budget type"><select className="field" value={draft.budgetType} onChange={(e) => update("budgetType", e.target.value as Draft["budgetType"])}><option value="daily">Daily budget</option><option value="lifetime">Lifetime budget</option></select></Field><Field label={`Amount (${account?.currency || "INR"})`}><input className="field" type="number" min="1" step="1" value={draft.budget} onChange={(e) => update("budget", e.target.value)} /></Field><Field label="Bid strategy"><select className="field" value={draft.bidStrategy} onChange={(e) => update("bidStrategy", e.target.value)}><option value="LOWEST_COST_WITHOUT_CAP">Highest volume</option><option value="COST_CAP">Cost per result goal</option><option value="LOWEST_COST_WITH_BID_CAP">Bid cap</option></select></Field></div>}</Section><Section title="Schedule" description={`Ad account timezone: ${account?.timezone_name || "Meta account timezone"}.`}><div className="grid gap-4 md:grid-cols-2"><Field label="Start date and time"><input className="field" type="datetime-local" value={draft.startTime} onChange={(e) => update("startTime", e.target.value)} /></Field><Field label="Optional end date"><input className="field" type="datetime-local" value={draft.endTime} onChange={(e) => update("endTime", e.target.value)} /></Field></div></Section></>}
            {step === 2 && <><Section title="Audience" description="Define the delivery plan that will be used when an ad set is created."><div className="grid gap-4 md:grid-cols-3"><Field label="Audience"><select className="field" value={draft.audienceType} onChange={(e) => update("audienceType", e.target.value)}><option value="broad">Advantage+ audience</option><option value="saved">Saved audience</option><option value="custom">Custom audience</option><option value="lookalike">Lookalike audience</option></select></Field><Field label="Minimum age"><input className="field" type="number" min="18" max="65" value={draft.ageMin} onChange={(e) => update("ageMin", e.target.value)} /></Field><Field label="Maximum age"><input className="field" type="number" min="18" max="65" value={draft.ageMax} onChange={(e) => update("ageMax", e.target.value)} /></Field><Field label="Gender"><select className="field" value={draft.genders} onChange={(e) => update("genders", e.target.value)}><option value="all">All genders</option><option value="male">Men</option><option value="female">Women</option></select></Field><Field label="Countries"><input className="field" value={draft.countries} onChange={(e) => update("countries", e.target.value)} placeholder="IN, US" /></Field><Field label="Cities or regions"><input className="field" value={draft.locations} onChange={(e) => update("locations", e.target.value)} placeholder="Hyderabad, Telangana" /></Field></div></Section><Section title="Placements" description="Choose automatic delivery or select Meta surfaces manually."><div className="grid gap-3 md:grid-cols-2"><Choice active={draft.placements === "advantage"} title="Advantage+ placements" copy="Let Meta distribute across available placements" onClick={() => update("placements", "advantage")} /><Choice active={draft.placements === "manual"} title="Manual placements" copy="Choose Facebook and Instagram surfaces" onClick={() => update("placements", "manual")} /></div>{draft.placements === "manual" && <div className="mt-4 grid gap-2 sm:grid-cols-2">{[["facebook_feed","Facebook Feed"],["instagram_feed","Instagram Feed"],["instagram_stories","Instagram Stories"],["instagram_reels","Instagram Reels"]].map(([value,label]) => <label className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm" key={value}><input type="checkbox" checked={draft.placementList.includes(value)} onChange={(e) => update("placementList", e.target.checked ? [...draft.placementList,value] : draft.placementList.filter((x)=>x!==value))} />{label}</label>)}</div>}</Section><Section title="Optimization & attribution"><div className="grid gap-4 md:grid-cols-2"><Field label="Optimization goal"><select className="field" value={draft.optimizationGoal} onChange={(e) => update("optimizationGoal", e.target.value)}><option value="LEAD_GENERATION">Leads</option><option value="LINK_CLICKS">Link clicks</option><option value="LANDING_PAGE_VIEWS">Landing page views</option><option value="IMPRESSIONS">Impressions</option><option value="REACH">Daily unique reach</option></select></Field><Field label="Attribution setting"><select className="field" value={draft.attribution} onChange={(e) => update("attribution", e.target.value)}><option value="7d_click_1d_view">7-day click or 1-day view</option><option value="1d_click_1d_view">1-day click or 1-day view</option><option value="1d_click">1-day click</option></select></Field></div></Section></>}
            {step === 3 && <><Section title="Ad creative plan" description="Creative details are saved with the paused campaign plan; no ad is published by this action."><div className="grid gap-4 md:grid-cols-2"><Field label="Destination URL"><input className="field" type="url" value={draft.destinationUrl} onChange={(e) => update("destinationUrl", e.target.value)} placeholder="https://example.com/landing-page" /></Field><Field label="Call to action"><select className="field" value={draft.callToAction} onChange={(e) => update("callToAction", e.target.value)}><option value="LEARN_MORE">Learn more</option><option value="SIGN_UP">Sign up</option><option value="CONTACT_US">Contact us</option><option value="GET_QUOTE">Get quote</option><option value="SHOP_NOW">Shop now</option></select></Field><Field label="Primary text"><textarea className="field min-h-28" value={draft.primaryText} onChange={(e) => update("primaryText", e.target.value)} maxLength={1250} /></Field><div className="space-y-4"><Field label="Headline"><input className="field" value={draft.headline} onChange={(e) => update("headline", e.target.value)} maxLength={255} /></Field><Field label="Description"><input className="field" value={draft.description} onChange={(e) => update("description", e.target.value)} maxLength={255} /></Field></div></div></Section><Section title="Tracking"><div className="grid gap-4 md:grid-cols-2"><Field label="Meta Pixel ID"><input className="field" value={draft.pixelId} onChange={(e) => update("pixelId", e.target.value)} placeholder="Optional" /></Field><Field label="URL parameters"><input className="field" value={draft.urlParameters} onChange={(e) => update("urlParameters", e.target.value)} /></Field></div></Section><div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100"><strong>Safe creation:</strong> This creates the real Meta campaign container in PAUSED state. Audience, placements, creative, and tracking are stored as its reviewed setup plan; no ad set, ad, delivery, or spend starts automatically.</div></>}
          </div>
          <aside className="border-l bg-background/60 p-5"><p className="text-xs font-bold uppercase tracking-widest text-accent">Review summary</p><h3 className="mt-3 font-display text-xl font-semibold">{draft.name || "Untitled campaign"}</h3><dl className="mt-5 space-y-4 text-sm"><Summary label="Objective" value={objectives.find(([value]) => value === draft.objective)?.[1] || draft.objective} /><Summary label="Budget" value={draft.budgetLevel === "campaign" ? `${money.format(Number(draft.budget || 0))} ${draft.budgetType}` : "Controlled at ad set"} /><Summary label="Audience" value={`${draft.countries || "No country"} · ${draft.ageMin}–${draft.ageMax}`} /><Summary label="Placements" value={draft.placements === "advantage" ? "Advantage+" : `${draft.placementList.length} selected`} /><Summary label="Delivery" value="PAUSED" /></dl><div className="mt-6 rounded-xl border bg-surface p-4 text-xs leading-5 text-muted"><strong className="text-foreground">Estimated setup</strong><br />1 paused campaign<br />0 active ad sets<br />0 active ads<br />No spend initiated</div></aside>
        </div>
        <footer className="flex items-center justify-between border-t px-6 py-4"><button type="button" className="btn-secondary" disabled={step === 0 || busy} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft size={16} /> Back</button>{step < steps.length - 1 ? <button type="button" className="btn-primary" onClick={next}>Continue <ArrowRight size={16} /></button> : <button className="btn-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} Create paused campaign</button>}</footer>
      </form>}
      {!creating && (campaigns === null || busy && campaigns.length === 0 ? <LoadingState /> : campaigns.length === 0 ? <EmptyState title="No campaigns found" description="Create the first paused campaign for this Meta ad account." /> : <section className="grid gap-3 lg:grid-cols-2">{campaigns.map((campaign) => { const active = campaign.effective_status === "ACTIVE" || campaign.status === "ACTIVE"; return <article key={campaign.external_campaign_id} className="rounded-2xl border bg-surface-raised p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-semibold">{campaign.name}</h2><p className="mt-1 text-xs text-muted">{campaign.objective?.replaceAll("_", " ") || "Objective unavailable"}</p></div><StatusBadge status={campaign.effective_status || campaign.status || "unknown"} /></div><div className="mt-5 flex items-center justify-between gap-4 border-t pt-4"><p className="text-xs text-muted">{campaign.daily_budget ? `${money.format(campaign.daily_budget)} daily` : campaign.lifetime_budget ? `${money.format(campaign.lifetime_budget)} lifetime` : "Ad-set budget"}</p><button className="btn-secondary" disabled={busy} onClick={() => void setStatus(campaign, active ? "PAUSED" : "ACTIVE")}>{active ? <Pause size={15} /> : <Play size={15} />}{active ? "Pause" : "Activate"}</button></div></article>; })}</section>)}
    </>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">{label}</span>{children}</label>; }
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="rounded-xl border bg-surface-raised p-5"><h2 className="font-display text-lg font-semibold">{title}</h2>{description && <p className="mt-1 mb-4 text-sm leading-6 text-muted">{description}</p>}{children}</section>; }
function Choice({ active, title, copy, onClick }: { active: boolean; title: string; copy: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left ${active ? "border-accent bg-accent/10" : "bg-background"}`}><span className="flex items-center justify-between"><strong>{title}</strong>{active && <Check size={16} className="text-accent" />}</span><span className="mt-1 block text-xs text-muted">{copy}</span></button>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase tracking-wider text-muted">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>; }
