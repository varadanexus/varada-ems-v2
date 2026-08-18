"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  LoaderCircle,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
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
type CampaignPlan = {
  budgetLevel?: string;
  audience?: {
    ageMin?: string;
    ageMax?: string;
    genders?: string;
    countries?: string[];
    locations?: string;
    audienceType?: string;
  };
  placements?: { type?: string; selected?: string[] };
  optimizationGoal?: string;
  attribution?: string;
  creative?: {
    destinationUrl?: string;
    primaryText?: string;
    headline?: string;
    description?: string;
    callToAction?: string;
  };
  tracking?: { pixelId?: string; urlParameters?: string };
};
type Campaign = {
  external_campaign_id: string;
  name: string;
  objective: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  start_time: string | null;
  stop_time: string | null;
  metadata?: {
    buyingType?: string;
    bidStrategy?: string;
    specialAdCategories?: string[];
    configuredStatus?: string;
    budgetRemaining?: number | null;
    spendCap?: number | null;
    createdTime?: string;
    updatedTime?: string;
    setupState?: string;
    adSetCreated?: boolean;
    adCreated?: boolean;
    advancedPlan?: CampaignPlan;
  };
};
type Draft = {
  name: string;
  objective: string;
  buyingType: string;
  specialCategory: string;
  budgetLevel: "campaign" | "adset";
  budgetType: "daily" | "lifetime";
  budget: string;
  bidStrategy: string;
  costCap: string;
  startTime: string;
  endTime: string;
  ageMin: string;
  ageMax: string;
  genders: string;
  countries: string;
  locations: string;
  audienceType: string;
  placements: "advantage" | "manual";
  placementList: string[];
  optimizationGoal: string;
  attribution: string;
  destinationUrl: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
  pixelId: string;
  urlParameters: string;
};

const initialDraft: Draft = {
  name: "",
  objective: "OUTCOME_LEADS",
  buyingType: "AUCTION",
  specialCategory: "NONE",
  budgetLevel: "campaign",
  budgetType: "daily",
  budget: "500",
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  costCap: "",
  startTime: "",
  endTime: "",
  ageMin: "18",
  ageMax: "65",
  genders: "all",
  countries: "IN",
  locations: "",
  audienceType: "broad",
  placements: "advantage",
  placementList: [
    "facebook_feed",
    "instagram_feed",
    "instagram_stories",
    "instagram_reels",
  ],
  optimizationGoal: "LEAD_GENERATION",
  attribution: "7d_click_1d_view",
  destinationUrl: "",
  primaryText: "",
  headline: "",
  description: "",
  callToAction: "LEARN_MORE",
  pixelId: "",
  urlParameters: "utm_source=meta&utm_medium=paid_social",
};

const steps = [
  "Campaign",
  "Budget & schedule",
  "Audience & placements",
  "Ad & review",
];
const objectives = [
  [
    "OUTCOME_AWARENESS",
    "Awareness",
    "Reach people likely to remember your ads",
  ],
  ["OUTCOME_TRAFFIC", "Traffic", "Send people to a destination"],
  [
    "OUTCOME_ENGAGEMENT",
    "Engagement",
    "Get messages, video views or interactions",
  ],
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
  const [openedCampaign, setOpenedCampaign] = useState<Campaign | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const account = accounts?.find(
    (item) => item.external_account_id === selected,
  );
  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: account?.currency || "INR",
        maximumFractionDigits: 0,
      }),
    [account?.currency],
  );
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const loadAccounts = useCallback(async () => {
    try {
      const rows = await socialEdgeFetch<AdAccount[]>("list_ad_accounts");
      setAccounts(rows);
      setSelected((current) => current || rows[0]?.external_account_id || "");
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Ad accounts could not be loaded.",
      );
      setAccounts([]);
    }
  }, []);
  const loadCampaigns = useCallback(async (adAccountId: string) => {
    if (!adAccountId) return setCampaigns([]);
    setBusy(true);
    try {
      const rows = await socialEdgeFetch<Campaign[]>("list_campaigns", {
        adAccountId,
      });
      setCampaigns(rows);
      setOpenedCampaign((current) =>
        current
          ? rows.find(
              (item) =>
                item.external_campaign_id === current.external_campaign_id,
            ) || current
          : null,
      );
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Campaigns could not be loaded.",
      );
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

  function openBuilder() {
    setDraft(initialDraft);
    setStep(0);
    setError("");
    setCreating(true);
  }
  function validate(currentStep = step) {
    if (currentStep === 0 && !draft.name.trim())
      return "Enter a campaign name.";
    if (
      currentStep === 1 &&
      draft.budgetLevel === "campaign" &&
      (!Number(draft.budget) || Number(draft.budget) <= 0)
    )
      return "Enter a valid campaign budget.";
    if (
      currentStep === 1 &&
      draft.endTime &&
      draft.startTime &&
      new Date(draft.endTime) <= new Date(draft.startTime)
    )
      return "End time must be after the start time.";
    if (currentStep === 2 && Number(draft.ageMax) < Number(draft.ageMin))
      return "Maximum age must be greater than minimum age.";
    if (currentStep === 2 && !draft.countries.trim())
      return "Add at least one country code.";
    return "";
  }
  function next() {
    const message = validate();
    if (message) return setError(message);
    setError("");
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function createCampaign() {
    const message = validate(0) || validate(1) || validate(2);
    if (message) return setError(message);
    setBusy(true);
    setError("");
    try {
      await socialEdgeFetch("create_campaign", {
        adAccountId: selected,
        name: draft.name.trim(),
        objective: draft.objective,
        buyingType: draft.buyingType,
        specialAdCategories:
          draft.specialCategory === "NONE" ? [] : [draft.specialCategory],
        dailyBudget:
          draft.budgetLevel === "campaign" && draft.budgetType === "daily"
            ? draft.budget
            : undefined,
        lifetimeBudget:
          draft.budgetLevel === "campaign" && draft.budgetType === "lifetime"
            ? draft.budget
            : undefined,
        bidStrategy: draft.bidStrategy,
        costCap: draft.costCap || undefined,
        startTime: draft.startTime || undefined,
        endTime: draft.endTime || undefined,
        advancedPlan: {
          budgetLevel: draft.budgetLevel,
          audience: {
            ageMin: draft.ageMin,
            ageMax: draft.ageMax,
            genders: draft.genders,
            countries: draft.countries
              .split(",")
              .map((x) => x.trim().toUpperCase())
              .filter(Boolean),
            locations: draft.locations,
            audienceType: draft.audienceType,
          },
          placements: { type: draft.placements, selected: draft.placementList },
          optimizationGoal: draft.optimizationGoal,
          attribution: draft.attribution,
          creative: {
            destinationUrl: draft.destinationUrl,
            primaryText: draft.primaryText,
            headline: draft.headline,
            description: draft.description,
            callToAction: draft.callToAction,
          },
          tracking: {
            pixelId: draft.pixelId,
            urlParameters: draft.urlParameters,
          },
        },
        status: "PAUSED",
      });
      setCreating(false);
      await loadCampaigns(selected);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Campaign could not be created.",
      );
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
      setOpenedCampaign((current) =>
        current?.external_campaign_id === campaign.external_campaign_id
          ? { ...current, status, effective_status: status }
          : current,
      );
      await loadCampaigns(selected);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Campaign could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function editCampaign(
    campaign: Campaign,
    changes: {
      name: string;
      budgetType: "daily" | "lifetime";
      budget: string;
      bidStrategy: string;
    },
  ) {
    const amount = changes.budget.trim() ? Number(changes.budget) : undefined;
    if (!changes.name.trim()) return setError("Campaign name is required.");
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0))
      return setError("Enter a valid campaign budget.");
    setBusy(true);
    setError("");
    try {
      const updated = await socialEdgeFetch<Campaign>("update_campaign", {
        campaignId: campaign.external_campaign_id,
        name: changes.name.trim(),
        dailyBudget:
          amount !== undefined && changes.budgetType === "daily"
            ? amount
            : undefined,
        lifetimeBudget:
          amount !== undefined && changes.budgetType === "lifetime"
            ? amount
            : undefined,
        bidStrategy: changes.bidStrategy || undefined,
      });
      setOpenedCampaign(updated);
      await loadCampaigns(selected);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Campaign changes could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function stopCampaign(campaign: Campaign) {
    setBusy(true);
    setError("");
    try {
      await socialEdgeFetch("update_campaign", {
        campaignId: campaign.external_campaign_id,
        status: "PAUSED",
      });
      setOpenedCampaign((current) =>
        current?.external_campaign_id === campaign.external_campaign_id
          ? { ...current, status: "PAUSED", effective_status: "PAUSED" }
          : current,
      );
      await loadCampaigns(selected);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Campaign could not be stopped.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    const confirmed = window.confirm(
      `Delete “${campaign.name}”?\n\nThis permanently removes campaign ${campaign.external_campaign_id} from Meta and Nexus Social. Active delivery must be stopped first. This action cannot be undone.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      if (
        campaign.effective_status === "ACTIVE" ||
        campaign.status === "ACTIVE"
      ) {
        await socialEdgeFetch("update_campaign", {
          campaignId: campaign.external_campaign_id,
          status: "PAUSED",
        });
      }
      await socialEdgeFetch("delete_campaign", {
        campaignId: campaign.external_campaign_id,
        confirmationName: campaign.name,
      });
      setOpenedCampaign(null);
      setCampaigns(
        (current) =>
          current?.filter(
            (item) =>
              item.external_campaign_id !== campaign.external_campaign_id,
          ) || [],
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Campaign could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Meta Marketing API"
        title="Ads campaigns"
        description="Plan, create, review, and control Meta advertising from the EMS."
        icon={Megaphone}
        actions={
          <>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => void loadAccounts()}
            >
              <RefreshCw size={16} className={busy ? "animate-spin" : ""} />{" "}
              Sync
            </button>
            <button
              className="btn-primary"
              disabled={!selected || busy}
              onClick={creating ? () => setCreating(false) : openBuilder}
            >
              {creating ? <X size={16} /> : <Plus size={16} />}{" "}
              {creating ? "Close builder" : "New campaign"}
            </button>
          </>
        }
      />
      {error && <ErrorState message={error} />}
      {accounts === null ? (
        <LoadingState />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No Meta ad accounts available"
          description="Connect Meta from Social Accounts and grant ads_management and ads_read."
        />
      ) : (
        <>
          <section className="rounded-2xl border bg-surface p-5">
            <Field label="Ad account">
              <select
                className="field max-w-2xl"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {accounts.map((item) => (
                  <option
                    key={item.external_account_id}
                    value={item.external_account_id}
                  >
                    {item.name} · {item.external_account_id} ·{" "}
                    {item.currency || "currency unavailable"}
                  </option>
                ))}
              </select>
            </Field>
          </section>
          {creating && (
            <section className="overflow-hidden rounded-2xl border bg-surface">
              <div className="border-b px-5 py-4">
                <div className="grid gap-2 md:grid-cols-4">
                  {steps.map((label, index) => (
                    <button
                      type="button"
                      key={label}
                      onClick={() => index <= step && setStep(index)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${step === index ? "border-accent bg-accent/10 text-foreground" : index < step ? "border-emerald-400/25 text-emerald-300" : "text-muted"}`}
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-full border text-xs">
                        {index < step ? <Check size={13} /> : index + 1}
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid min-h-[520px] lg:grid-cols-[1fr_320px]">
                <div className="space-y-6 p-6">
                  {step === 0 && (
                    <>
                      <Section
                        title="Campaign setup"
                        description="Choose the business outcome and campaign-level controls."
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Campaign name">
                            <input
                              className="field"
                              value={draft.name}
                              onChange={(e) => update("name", e.target.value)}
                              maxLength={180}
                              placeholder="Q4 Lead Generation · India"
                            />
                          </Field>
                          <Field label="Buying type">
                            <select
                              className="field"
                              value={draft.buyingType}
                              onChange={(e) =>
                                update("buyingType", e.target.value)
                              }
                            >
                              <option value="AUCTION">Auction</option>
                              <option value="RESERVED">Reservation</option>
                            </select>
                          </Field>
                        </div>
                      </Section>
                      <Section
                        title="Campaign objective"
                        description="Meta optimizes delivery around the selected outcome."
                      >
                        <div className="grid gap-3 md:grid-cols-2">
                          {objectives.map(([value, label, copy]) => (
                            <button
                              type="button"
                              key={value}
                              onClick={() => update("objective", value)}
                              className={`rounded-xl border p-4 text-left ${draft.objective === value ? "border-accent bg-accent/10" : "bg-background"}`}
                            >
                              <strong className="block">{label}</strong>
                              <span className="mt-1 block text-xs leading-5 text-muted">
                                {copy}
                              </span>
                            </button>
                          ))}
                        </div>
                      </Section>
                      <Section
                        title="Special ad categories"
                        description="Required for credit, employment, housing, and social-issue advertising."
                      >
                        <Field label="Category">
                          <select
                            className="field max-w-xl"
                            value={draft.specialCategory}
                            onChange={(e) =>
                              update("specialCategory", e.target.value)
                            }
                          >
                            <option value="NONE">None</option>
                            <option value="CREDIT">Credit</option>
                            <option value="EMPLOYMENT">Employment</option>
                            <option value="HOUSING">Housing</option>
                            <option value="ISSUES_ELECTIONS_POLITICS">
                              Social issues, elections or politics
                            </option>
                          </select>
                        </Field>
                      </Section>
                    </>
                  )}
                  {step === 1 && (
                    <>
                      <Section
                        title="Budget strategy"
                        description="Use Advantage campaign budget or control spend later at ad-set level."
                      >
                        <div className="grid gap-3 md:grid-cols-2">
                          <Choice
                            active={draft.budgetLevel === "campaign"}
                            title="Campaign budget"
                            copy="Meta distributes budget across ad sets"
                            onClick={() => update("budgetLevel", "campaign")}
                          />
                          <Choice
                            active={draft.budgetLevel === "adset"}
                            title="Ad set budget"
                            copy="Set independent budgets per audience"
                            onClick={() => update("budgetLevel", "adset")}
                          />
                        </div>
                        {draft.budgetLevel === "campaign" && (
                          <div className="mt-4 grid gap-4 md:grid-cols-3">
                            <Field label="Budget type">
                              <select
                                className="field"
                                value={draft.budgetType}
                                onChange={(e) =>
                                  update(
                                    "budgetType",
                                    e.target.value as Draft["budgetType"],
                                  )
                                }
                              >
                                <option value="daily">Daily budget</option>
                                <option value="lifetime">
                                  Lifetime budget
                                </option>
                              </select>
                            </Field>
                            <Field
                              label={`Amount (${account?.currency || "INR"})`}
                            >
                              <input
                                className="field"
                                type="number"
                                min="1"
                                step="1"
                                value={draft.budget}
                                onChange={(e) =>
                                  update("budget", e.target.value)
                                }
                              />
                            </Field>
                            <Field label="Bid strategy">
                              <select
                                className="field"
                                value={draft.bidStrategy}
                                onChange={(e) =>
                                  update("bidStrategy", e.target.value)
                                }
                              >
                                <option value="LOWEST_COST_WITHOUT_CAP">
                                  Highest volume
                                </option>
                                <option value="COST_CAP">
                                  Cost per result goal
                                </option>
                                <option value="LOWEST_COST_WITH_BID_CAP">
                                  Bid cap
                                </option>
                              </select>
                            </Field>
                          </div>
                        )}
                      </Section>
                      <Section
                        title="Schedule"
                        description={`Ad account timezone: ${account?.timezone_name || "Meta account timezone"}.`}
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Start date and time">
                            <input
                              className="field"
                              type="datetime-local"
                              value={draft.startTime}
                              onChange={(e) =>
                                update("startTime", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Optional end date">
                            <input
                              className="field"
                              type="datetime-local"
                              value={draft.endTime}
                              onChange={(e) =>
                                update("endTime", e.target.value)
                              }
                            />
                          </Field>
                        </div>
                      </Section>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <Section
                        title="Audience"
                        description="Define the delivery plan that will be used when an ad set is created."
                      >
                        <div className="grid gap-4 md:grid-cols-3">
                          <Field label="Audience">
                            <select
                              className="field"
                              value={draft.audienceType}
                              onChange={(e) =>
                                update("audienceType", e.target.value)
                              }
                            >
                              <option value="broad">Advantage+ audience</option>
                              <option value="saved">Saved audience</option>
                              <option value="custom">Custom audience</option>
                              <option value="lookalike">
                                Lookalike audience
                              </option>
                            </select>
                          </Field>
                          <Field label="Minimum age">
                            <input
                              className="field"
                              type="number"
                              min="18"
                              max="65"
                              value={draft.ageMin}
                              onChange={(e) => update("ageMin", e.target.value)}
                            />
                          </Field>
                          <Field label="Maximum age">
                            <input
                              className="field"
                              type="number"
                              min="18"
                              max="65"
                              value={draft.ageMax}
                              onChange={(e) => update("ageMax", e.target.value)}
                            />
                          </Field>
                          <Field label="Gender">
                            <select
                              className="field"
                              value={draft.genders}
                              onChange={(e) =>
                                update("genders", e.target.value)
                              }
                            >
                              <option value="all">All genders</option>
                              <option value="male">Men</option>
                              <option value="female">Women</option>
                            </select>
                          </Field>
                          <Field label="Countries">
                            <input
                              className="field"
                              value={draft.countries}
                              onChange={(e) =>
                                update("countries", e.target.value)
                              }
                              placeholder="IN, US"
                            />
                          </Field>
                          <Field label="Cities or regions">
                            <input
                              className="field"
                              value={draft.locations}
                              onChange={(e) =>
                                update("locations", e.target.value)
                              }
                              placeholder="Hyderabad, Telangana"
                            />
                          </Field>
                        </div>
                      </Section>
                      <Section
                        title="Placements"
                        description="Choose automatic delivery or select Meta surfaces manually."
                      >
                        <div className="grid gap-3 md:grid-cols-2">
                          <Choice
                            active={draft.placements === "advantage"}
                            title="Advantage+ placements"
                            copy="Let Meta distribute across available placements"
                            onClick={() => update("placements", "advantage")}
                          />
                          <Choice
                            active={draft.placements === "manual"}
                            title="Manual placements"
                            copy="Choose Facebook and Instagram surfaces"
                            onClick={() => update("placements", "manual")}
                          />
                        </div>
                        {draft.placements === "manual" && (
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {[
                              ["facebook_feed", "Facebook Feed"],
                              ["instagram_feed", "Instagram Feed"],
                              ["instagram_stories", "Instagram Stories"],
                              ["instagram_reels", "Instagram Reels"],
                            ].map(([value, label]) => (
                              <label
                                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm"
                                key={value}
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.placementList.includes(value)}
                                  onChange={(e) =>
                                    update(
                                      "placementList",
                                      e.target.checked
                                        ? [...draft.placementList, value]
                                        : draft.placementList.filter(
                                            (x) => x !== value,
                                          ),
                                    )
                                  }
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        )}
                      </Section>
                      <Section title="Optimization & attribution">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Optimization goal">
                            <select
                              className="field"
                              value={draft.optimizationGoal}
                              onChange={(e) =>
                                update("optimizationGoal", e.target.value)
                              }
                            >
                              <option value="LEAD_GENERATION">Leads</option>
                              <option value="LINK_CLICKS">Link clicks</option>
                              <option value="LANDING_PAGE_VIEWS">
                                Landing page views
                              </option>
                              <option value="IMPRESSIONS">Impressions</option>
                              <option value="REACH">Daily unique reach</option>
                            </select>
                          </Field>
                          <Field label="Attribution setting">
                            <select
                              className="field"
                              value={draft.attribution}
                              onChange={(e) =>
                                update("attribution", e.target.value)
                              }
                            >
                              <option value="7d_click_1d_view">
                                7-day click or 1-day view
                              </option>
                              <option value="1d_click_1d_view">
                                1-day click or 1-day view
                              </option>
                              <option value="1d_click">1-day click</option>
                            </select>
                          </Field>
                        </div>
                      </Section>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <Section
                        title="Ad creative plan"
                        description="Creative details are saved with the paused campaign plan; no ad is published by this action."
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Destination URL">
                            <input
                              className="field"
                              type="url"
                              value={draft.destinationUrl}
                              onChange={(e) =>
                                update("destinationUrl", e.target.value)
                              }
                              placeholder="https://example.com/landing-page"
                            />
                          </Field>
                          <Field label="Call to action">
                            <select
                              className="field"
                              value={draft.callToAction}
                              onChange={(e) =>
                                update("callToAction", e.target.value)
                              }
                            >
                              <option value="LEARN_MORE">Learn more</option>
                              <option value="SIGN_UP">Sign up</option>
                              <option value="CONTACT_US">Contact us</option>
                              <option value="GET_QUOTE">Get quote</option>
                              <option value="SHOP_NOW">Shop now</option>
                            </select>
                          </Field>
                          <Field label="Primary text">
                            <textarea
                              className="field min-h-28"
                              value={draft.primaryText}
                              onChange={(e) =>
                                update("primaryText", e.target.value)
                              }
                              maxLength={1250}
                            />
                          </Field>
                          <div className="space-y-4">
                            <Field label="Headline">
                              <input
                                className="field"
                                value={draft.headline}
                                onChange={(e) =>
                                  update("headline", e.target.value)
                                }
                                maxLength={255}
                              />
                            </Field>
                            <Field label="Description">
                              <input
                                className="field"
                                value={draft.description}
                                onChange={(e) =>
                                  update("description", e.target.value)
                                }
                                maxLength={255}
                              />
                            </Field>
                          </div>
                        </div>
                      </Section>
                      <Section title="Tracking">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Meta Pixel ID">
                            <input
                              className="field"
                              value={draft.pixelId}
                              onChange={(e) =>
                                update("pixelId", e.target.value)
                              }
                              placeholder="Optional"
                            />
                          </Field>
                          <Field label="URL parameters">
                            <input
                              className="field"
                              value={draft.urlParameters}
                              onChange={(e) =>
                                update("urlParameters", e.target.value)
                              }
                            />
                          </Field>
                        </div>
                      </Section>
                      <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                        <strong>Safe creation:</strong> This creates the real
                        Meta campaign container in PAUSED state. Audience,
                        placements, creative, and tracking are stored as its
                        reviewed setup plan; no ad set, ad, delivery, or spend
                        starts automatically.
                      </div>
                    </>
                  )}
                </div>
                <aside className="border-l bg-background/60 p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-accent">
                    Review summary
                  </p>
                  <h3 className="mt-3 font-display text-xl font-semibold">
                    {draft.name || "Untitled campaign"}
                  </h3>
                  <dl className="mt-5 space-y-4 text-sm">
                    <Summary
                      label="Objective"
                      value={
                        objectives.find(
                          ([value]) => value === draft.objective,
                        )?.[1] || draft.objective
                      }
                    />
                    <Summary
                      label="Budget"
                      value={
                        draft.budgetLevel === "campaign"
                          ? `${money.format(Number(draft.budget || 0))} ${draft.budgetType}`
                          : "Controlled at ad set"
                      }
                    />
                    <Summary
                      label="Audience"
                      value={`${draft.countries || "No country"} · ${draft.ageMin}–${draft.ageMax}`}
                    />
                    <Summary
                      label="Placements"
                      value={
                        draft.placements === "advantage"
                          ? "Advantage+"
                          : `${draft.placementList.length} selected`
                      }
                    />
                    <Summary label="Delivery" value="PAUSED" />
                  </dl>
                  <div className="mt-6 rounded-xl border bg-surface p-4 text-xs leading-5 text-muted">
                    <strong className="text-foreground">Estimated setup</strong>
                    <br />1 paused campaign
                    <br />0 active ad sets
                    <br />0 active ads
                    <br />
                    No spend initiated
                  </div>
                </aside>
              </div>
              <footer className="flex items-center justify-between border-t px-6 py-4">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={step === 0 || busy}
                  onClick={() => setStep((value) => Math.max(0, value - 1))}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                {step < steps.length - 1 ? (
                  <button type="button" className="btn-primary" onClick={next}>
                    Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => void createCampaign()}
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )}{" "}
                    Create paused campaign
                  </button>
                )}
              </footer>
            </section>
          )}
          {!creating &&
            (campaigns === null || (busy && campaigns.length === 0) ? (
              <LoadingState />
            ) : campaigns.length === 0 ? (
              <EmptyState
                title="No campaigns found"
                description="Create the first paused campaign for this Meta ad account."
              />
            ) : (
              <section className="grid gap-3 lg:grid-cols-2">
                {campaigns.map((campaign) => {
                  const active =
                    campaign.effective_status === "ACTIVE" ||
                    campaign.status === "ACTIVE";
                  return (
                    <article
                      key={campaign.external_campaign_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenedCampaign(campaign)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          setOpenedCampaign(campaign);
                      }}
                      className="cursor-pointer rounded-2xl border bg-surface-raised p-5 transition hover:border-accent/50 hover:bg-surface"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="font-display text-lg font-semibold">
                            {campaign.name}
                          </h2>
                          <p className="mt-1 text-xs text-muted">
                            {campaign.objective?.replaceAll("_", " ") ||
                              "Objective unavailable"}
                          </p>
                          <p className="mt-2 text-[11px] text-muted">
                            ID {campaign.external_campaign_id}
                          </p>
                        </div>
                        <StatusBadge
                          status={
                            campaign.effective_status ||
                            campaign.status ||
                            "unknown"
                          }
                        />
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                        <p className="text-xs text-muted">
                          {campaign.daily_budget
                            ? `${money.format(campaign.daily_budget)} daily`
                            : campaign.lifetime_budget
                              ? `${money.format(campaign.lifetime_budget)} lifetime`
                              : "Ad-set budget"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="btn-secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenedCampaign(campaign);
                            }}
                          >
                            <Eye size={15} /> Details
                          </button>
                          {active ? (
                            <button
                              className="btn-secondary"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                void stopCampaign(campaign);
                              }}
                            >
                              <Square size={14} /> Stop
                            </button>
                          ) : (
                            <button
                              className="btn-secondary"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                void setStatus(campaign, "ACTIVE");
                              }}
                            >
                              <Play size={15} /> Activate
                            </button>
                          )}
                          <button
                            className="btn-secondary border-red-400/30 text-red-200"
                            disabled={busy}
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteCampaign(campaign);
                            }}
                          >
                            <Trash2 size={15} /> Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          {openedCampaign && (
            <CampaignDetails
              key={openedCampaign.external_campaign_id}
              campaign={openedCampaign}
              money={money}
              busy={busy}
              onClose={() => setOpenedCampaign(null)}
              onStop={() => void stopCampaign(openedCampaign)}
              onActivate={() => void setStatus(openedCampaign, "ACTIVE")}
              onDelete={() => void deleteCampaign(openedCampaign)}
              onSave={(changes) => void editCampaign(openedCampaign, changes)}
            />
          )}
        </>
      )}
    </div>
  );
}

function CampaignDetails({
  campaign,
  money,
  busy,
  onClose,
  onStop,
  onActivate,
  onDelete,
  onSave,
}: {
  campaign: Campaign;
  money: Intl.NumberFormat;
  busy: boolean;
  onClose: () => void;
  onStop: () => void;
  onActivate: () => void;
  onDelete: () => void;
  onSave: (changes: {
    name: string;
    budgetType: "daily" | "lifetime";
    budget: string;
    bidStrategy: string;
  }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(campaign.name);
  const [editBudgetType] = useState<"daily" | "lifetime">(
    campaign.lifetime_budget ? "lifetime" : "daily",
  );
  const [editBudget, setEditBudget] = useState(
    String(campaign.lifetime_budget || campaign.daily_budget || ""),
  );
  const [editBidStrategy, setEditBidStrategy] = useState(
    campaign.metadata?.bidStrategy || "",
  );
  const active =
    campaign.effective_status === "ACTIVE" || campaign.status === "ACTIVE";
  const plan = campaign.metadata?.advancedPlan;
  const audience = plan?.audience;
  const creative = plan?.creative;
  const tracking = plan?.tracking;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function save() {
    onSave({
      name: editName,
      budgetType: editBudgetType,
      budget: editBudget,
      bidStrategy: editBidStrategy,
    });
    setEditing(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-details-title"
        className="h-full w-full max-w-3xl overflow-y-auto border-l bg-background shadow-2xl"
      >
        <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-accent">
                Meta campaign details
              </p>
              <h2
                id="campaign-details-title"
                className="mt-2 truncate font-display text-2xl font-semibold"
              >
                {campaign.name}
              </h2>
              <p className="mt-1 break-all text-xs text-muted">
                Campaign ID {campaign.external_campaign_id}
              </p>
            </div>
            <button
              className="btn-secondary shrink-0"
              aria-label="Close campaign details"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <StatusBadge
              status={campaign.effective_status || campaign.status || "unknown"}
            />
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? <X size={15} /> : <Eye size={15} />}{" "}
              {editing ? "Cancel edit" : "Edit campaign"}
            </button>
            {active ? (
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={onStop}
              >
                <Square size={14} /> Stop
              </button>
            ) : (
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={onActivate}
              >
                <Play size={15} /> Activate
              </button>
            )}
            <button
              className="btn-secondary border-red-400/30 text-red-200"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </header>

        <div className="space-y-5 p-6">
          {editing && (
            <Section
              title="Edit campaign"
              description="Meta permits these campaign-level settings to be changed after creation. Objective and buying type are fixed."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Campaign name">
                  <input
                    className="field"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={180}
                  />
                </Field>
                <Field label="Bid strategy">
                  <select
                    className="field"
                    value={editBidStrategy}
                    onChange={(event) => setEditBidStrategy(event.target.value)}
                  >
                    <option value="">Not set (leave unchanged)</option>
                    <option value="LOWEST_COST_WITHOUT_CAP">
                      Highest volume
                    </option>
                    <option value="COST_CAP">Cost per result goal</option>
                    <option value="LOWEST_COST_WITH_BID_CAP">Bid cap</option>
                  </select>
                </Field>
                <Field label="Budget type">
                  <input
                    className="field"
                    value={
                      editBudgetType === "daily"
                        ? "Daily budget"
                        : "Lifetime budget"
                    }
                    disabled
                  />
                </Field>
                <Field label="Budget amount (optional for ad-set budgets)">
                  <input
                    className="field"
                    type="number"
                    min="1"
                    step="1"
                    value={editBudget}
                    onChange={(event) => setEditBudget(event.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-4 flex justify-end">
                <button className="btn-primary" disabled={busy} onClick={save}>
                  {busy ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  Save changes
                </button>
              </div>
            </Section>
          )}

          <DetailSection title="Overview">
            <Detail label="Name" value={campaign.name} />
            <Detail label="Objective" value={humanize(campaign.objective)} />
            <Detail
              label="Buying type"
              value={humanize(campaign.metadata?.buyingType)}
            />
            <Detail
              label="Bid strategy"
              value={humanize(campaign.metadata?.bidStrategy)}
            />
            <Detail
              label="Configured status"
              value={humanize(
                campaign.metadata?.configuredStatus || campaign.status,
              )}
            />
            <Detail
              label="Effective status"
              value={humanize(campaign.effective_status)}
            />
            <Detail
              label="Special ad categories"
              value={
                campaign.metadata?.specialAdCategories?.length
                  ? campaign.metadata.specialAdCategories
                      .map(humanize)
                      .join(", ")
                  : "None"
              }
            />
            <Detail
              label="Setup state"
              value={humanize(campaign.metadata?.setupState)}
            />
          </DetailSection>

          <DetailSection title="Budget and schedule">
            <Detail
              label="Daily budget"
              value={
                campaign.daily_budget
                  ? money.format(campaign.daily_budget)
                  : "Not set"
              }
            />
            <Detail
              label="Lifetime budget"
              value={
                campaign.lifetime_budget
                  ? money.format(campaign.lifetime_budget)
                  : "Not set"
              }
            />
            <Detail
              label="Budget remaining"
              value={
                campaign.metadata?.budgetRemaining != null
                  ? money.format(campaign.metadata.budgetRemaining)
                  : "Not available"
              }
            />
            <Detail
              label="Spend cap"
              value={
                campaign.metadata?.spendCap != null
                  ? money.format(campaign.metadata.spendCap)
                  : "Not set"
              }
            />
            <Detail
              label="Start time"
              value={formatDate(campaign.start_time)}
            />
            <Detail label="End time" value={formatDate(campaign.stop_time)} />
            <Detail
              label="Created"
              value={formatDate(campaign.metadata?.createdTime)}
            />
            <Detail
              label="Last updated"
              value={formatDate(campaign.metadata?.updatedTime)}
            />
          </DetailSection>

          <DetailSection title="Audience and delivery plan">
            <Detail
              label="Audience type"
              value={humanize(audience?.audienceType)}
            />
            <Detail
              label="Age range"
              value={
                audience?.ageMin || audience?.ageMax
                  ? `${audience?.ageMin || "18"}–${audience?.ageMax || "65+"}`
                  : "Not configured"
              }
            />
            <Detail label="Gender" value={humanize(audience?.genders)} />
            <Detail
              label="Countries"
              value={audience?.countries?.join(", ") || "Not configured"}
            />
            <Detail
              label="Cities or regions"
              value={audience?.locations || "Not configured"}
            />
            <Detail
              label="Placement mode"
              value={humanize(plan?.placements?.type)}
            />
            <Detail
              label="Selected placements"
              value={
                plan?.placements?.selected?.map(humanize).join(", ") ||
                "Meta automatic placements"
              }
            />
            <Detail
              label="Optimization goal"
              value={humanize(plan?.optimizationGoal)}
            />
            <Detail label="Attribution" value={humanize(plan?.attribution)} />
          </DetailSection>

          <DetailSection title="Creative and tracking">
            <Detail
              label="Destination URL"
              value={
                creative?.destinationUrl ? (
                  <a
                    className="break-all text-accent underline"
                    href={creative.destinationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {creative.destinationUrl}
                  </a>
                ) : (
                  "Not configured"
                )
              }
            />
            <Detail
              label="Call to action"
              value={humanize(creative?.callToAction)}
            />
            <Detail
              label="Headline"
              value={creative?.headline || "Not configured"}
            />
            <Detail
              label="Description"
              value={creative?.description || "Not configured"}
            />
            <Detail
              label="Primary text"
              value={creative?.primaryText || "Not configured"}
              wide
            />
            <Detail
              label="Meta Pixel ID"
              value={tracking?.pixelId || "Not configured"}
            />
            <Detail
              label="URL parameters"
              value={tracking?.urlParameters || "Not configured"}
            />
          </DetailSection>

          <section className="rounded-xl border bg-surface-raised p-5">
            <h3 className="font-display text-lg font-semibold">
              Meta object state
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ObjectState label="Campaign" ready />
              <ObjectState
                label="Ad set"
                ready={Boolean(campaign.metadata?.adSetCreated)}
              />
              <ObjectState
                label="Ad"
                ready={Boolean(campaign.metadata?.adCreated)}
              />
            </div>
            <p className="mt-4 text-xs leading-5 text-muted">
              Campaign controls affect the Meta campaign container. Saved
              audience and creative details remain a setup plan until
              corresponding ad sets and ads are created.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-surface-raised p-5">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}
function Detail({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-bold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
        {value}
      </dd>
    </div>
  );
}
function ObjectState({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-2 text-sm font-semibold ${ready ? "text-emerald-300" : "text-muted"}`}
      >
        {ready ? "Created" : "Not created"}
      </p>
    </div>
  );
}
function humanize(value?: string | null) {
  if (!value) return "Not available";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.getTime() <= 0
      ? "Not scheduled"
      : date.toLocaleString("en-IN");
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-surface-raised p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 mb-4 text-sm leading-6 text-muted">{description}</p>
      )}
      {children}
    </section>
  );
}
function Choice({
  active,
  title,
  copy,
  onClick,
}: {
  active: boolean;
  title: string;
  copy: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left ${active ? "border-accent bg-accent/10" : "bg-background"}`}
    >
      <span className="flex items-center justify-between">
        <strong>{title}</strong>
        {active && <Check size={16} className="text-accent" />}
      </span>
      <span className="mt-1 block text-xs text-muted">{copy}</span>
    </button>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
