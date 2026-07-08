// mcp/tools/ai.mjs — AI cost reporting + router settings (incl. pause/resume).

import { z } from "zod";
import { sbGet, sbUpdate, enc } from "../lib/supabase.mjs";
import { audit } from "../lib/audit.mjs";
import { ok, fail, guard } from "./_util.mjs";

export function register(server) {
  // 15) get_ai_costs ----------------------------------------------------------
  server.registerTool(
    "get_ai_costs",
    {
      title: "Get AI costs",
      description:
        "Report AI spend vs budget for a month (default: current). Returns monthly budget, spent, " +
        "remaining, per-provider and per-model breakdowns, and the most recent AI calls.",
      inputSchema: {
        month: z.string().optional().describe("YYYY-MM (default current month)."),
      },
    },
    guard(async (a) => {
      const now = new Date();
      const [y, m] = a.month
        ? a.month.split("-").map(Number)
        : [now.getUTCFullYear(), now.getUTCMonth() + 1];
      if (!y || !m || m < 1 || m > 12) return fail("month must be YYYY-MM.");
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      const end = new Date(Date.UTC(y, m, 1)).toISOString();

      const [settingsRows, logs] = await Promise.all([
        sbGet("ai_router_settings", "select=*&id=eq.1&limit=1"),
        sbGet("ai_cost_logs",
          `select=provider,model,tier,cost_usd,tokens_in,tokens_out,task_type,error,created_at` +
          `&created_at=gte.${enc(start)}&created_at=lt.${enc(end)}&order=created_at.desc&limit=1000`),
      ]);
      const settings = (settingsRows && settingsRows[0]) || {};
      const rows = logs || [];
      const spent = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
      const monthlyBudget = Number(settings.monthly_budget_usd) || 15;

      const byProvider = {}, byModel = {};
      for (const r of rows) {
        byProvider[r.provider] = (byProvider[r.provider] || 0) + (Number(r.cost_usd) || 0);
        const key = `${r.provider}:${r.model}`;
        byModel[key] = byModel[key] || { calls: 0, cost_usd: 0, failures: 0 };
        byModel[key].calls++; byModel[key].cost_usd += Number(r.cost_usd) || 0;
        if (r.error) byModel[key].failures++;
      }
      const round = (n) => Math.round(n * 1e6) / 1e6;
      return ok({
        month: `${y}-${String(m).padStart(2, "0")}`,
        paused: !!settings.ai_paused,
        monthly_budget_usd: monthlyBudget,
        daily_budget_usd: settings.daily_budget_usd ?? null,
        max_cost_per_article_usd: settings.max_cost_per_article_usd ?? null,
        spent_usd: round(spent),
        remaining_usd: round(Math.max(0, monthlyBudget - spent)),
        total_calls: rows.length,
        failures: rows.filter((r) => r.error).length,
        by_provider: Object.fromEntries(Object.entries(byProvider).map(([k, v]) => [k, round(v)])),
        by_model: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, { ...v, cost_usd: round(v.cost_usd) }])),
        recent_calls: rows.slice(0, 15),
      });
    })
  );

  // 16) update_ai_router_settings --------------------------------------------
  server.registerTool(
    "update_ai_router_settings",
    {
      title: "Update AI router settings",
      description:
        "Safely update the AI router settings singleton: budgets, per-tier model overrides, provider " +
        "priority order, and the pause_generation kill-switch. Only provided fields change.",
      inputSchema: {
        monthly_budget: z.number().min(0).optional(),
        daily_budget: z.number().min(0).nullable().optional().describe("null clears the daily cap."),
        max_cost_per_article: z.number().min(0).optional(),
        cheap_model: z.string().nullable().optional(),
        medium_model: z.string().nullable().optional(),
        premium_model: z.string().nullable().optional(),
        provider_priority: z.array(z.enum(["openrouter", "gemini_direct", "openai", "anthropic"]))
          .optional().describe("Ordered; index 0 is tried first."),
        pause_generation: z.boolean().optional().describe("true pauses ALL AI generation; false resumes."),
      },
    },
    guard(async (a) => {
      const patch = {};
      if (a.monthly_budget !== undefined) patch.monthly_budget_usd = a.monthly_budget;
      if (a.daily_budget !== undefined) patch.daily_budget_usd = a.daily_budget;
      if (a.max_cost_per_article !== undefined) patch.max_cost_per_article_usd = a.max_cost_per_article;
      if (a.cheap_model !== undefined) patch.cheap_model = a.cheap_model;
      if (a.medium_model !== undefined) patch.medium_model = a.medium_model;
      if (a.premium_model !== undefined) patch.premium_model = a.premium_model;
      if (a.provider_priority !== undefined) patch.provider_priority = a.provider_priority;
      if (a.pause_generation !== undefined) patch.ai_paused = a.pause_generation;
      if (Object.keys(patch).length === 0) return fail("No settings provided to update.");
      patch.updated_at = new Date().toISOString();

      const [updated] = await sbUpdate("ai_router_settings", "id=eq.1", patch);
      await audit({ tool: "update_ai_router_settings", action: "settings", targetType: "settings",
        targetId: "ai_router_settings", destructive: a.pause_generation !== undefined,
        summary: `Updated router settings: ${Object.keys(patch).filter((k) => k !== "updated_at").join(", ")}`,
        detail: { patch } });
      return ok({ settings: updated },
        a.pause_generation === true ? "AI generation is now PAUSED."
          : a.pause_generation === false ? "AI generation is now RESUMED." : "Router settings updated.");
    })
  );
}
