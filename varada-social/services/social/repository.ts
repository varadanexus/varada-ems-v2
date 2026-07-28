import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DashboardData, SocialContentItem } from "@/types/social";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function beginningOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function getDefaultBrandId() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("social_brands")
    .select("id")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .single();
  if (error || !data) throw new Error("Create an active social brand in Settings.");
  return data.id as string;
}

export async function getDashboard(userName: string): Promise<DashboardData> {
  const admin = createAdminClient();
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monthStart = beginningOfMonth();
  const since = new Date();
  since.setDate(since.getDate() - 29);

  const [
    contentResult,
    todayResult,
    publishedResult,
    metricResult,
    trendResult,
    accountResult,
  ] = await Promise.all([
    admin
      .from("social_content_items")
      .select("id,title,format,status,platforms,topic,objective,tone,content_package,scheduled_for,published_at,rejection_reason,version,created_at,updated_at")
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    admin
      .from("social_content_items")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_for", today.toISOString())
      .lt("scheduled_for", tomorrow.toISOString()),
    admin
      .from("social_content_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", monthStart.toISOString()),
    admin
      .from("social_post_metrics")
      .select("captured_at,likes,comments,shares,saves,reach,impressions,followers,engagement_rate")
      .gte("captured_at", since.toISOString())
      .order("captured_at"),
    admin
      .from("social_trend_signals")
      .select("id,title,signal_type,score,source")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("score", { ascending: false })
      .limit(5),
    admin
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  if (contentResult.error) throw contentResult.error;
  const content = (contentResult.data || []) as SocialContentItem[];
  const rows = metricResult.data || [];
  const latestByDay = new Map<string, typeof rows[number]>();
  rows.forEach((row) => latestByDay.set(String(row.captured_at).slice(0, 10), row));
  const engagementSeries = Array.from(latestByDay.entries()).map(([date, row]) => ({
    date,
    interactions:
      Number(row.likes || 0) +
      Number(row.comments || 0) +
      Number(row.shares || 0) +
      Number(row.saves || 0),
  }));
  const reach = rows.reduce((sum, row) => sum + Number(row.reach || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const interactions = engagementSeries.reduce((sum, row) => sum + row.interactions, 0);
  const followers = rows.map((row) => Number(row.followers || 0)).filter(Boolean);

  const pipeline = content.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const upcoming = content
    .filter((item) => item.scheduled_for && new Date(item.scheduled_for) >= new Date())
    .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)))
    .slice(0, 6);
  const bestFormat = rows.length
    ? "Performance recommendations will strengthen as more posts are synchronized."
    : null;

  return {
    userName,
    metrics: {
      today: todayResult.count || 0,
      scheduled: pipeline.scheduled || 0,
      published: publishedResult.count || 0,
      drafts: pipeline.draft || 0,
      pendingApprovals:
        (pipeline.manager_review || 0) + (pipeline.admin_review || 0),
      reach,
      impressions,
      interactions,
      engagementRate: impressions ? (interactions / impressions) * 100 : 0,
      followerGrowth:
        followers.length > 1 ? followers[followers.length - 1] - followers[0] : 0,
    },
    pipeline,
    engagementSeries,
    upcoming,
    trends: (trendResult.data || []).map((trend) => ({
      ...trend,
      score: Number(trend.score || 0),
    })),
    recommendation: bestFormat,
    accountsConnected: accountResult.count || 0,
    hasAnalytics: rows.length > 0,
  };
}

export async function listContent(filters: {
  status?: string | null;
  query?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const admin = createAdminClient();
  let query = admin
    .from("social_content_items")
    .select("*,social_media_assets(id,storage_path,media_type,mime_type,metadata),social_content_channels(id,platform,status,scheduled_for,external_permalink)")
    .order("created_at", { ascending: false });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.query) query = query.ilike("title", `%${filters.query}%`);
  if (filters.from) query = query.gte("scheduled_for", filters.from);
  if (filters.to) query = query.lte("scheduled_for", filters.to);
  const { data, error } = await query.limit(250);
  if (error) throw error;
  return data || [];
}

export async function getAnalytics(days = 30) {
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, Math.min(days, 365)));
  const { data, error } = await admin
    .from("social_post_metrics")
    .select("*,social_content_channels(platform,content_id,social_content_items(title,format,published_at))")
    .gte("captured_at", since.toISOString())
    .order("captured_at");
  if (error) throw error;
  const rows = data || [];
  const totals = rows.reduce(
    (acc, row) => {
      acc.likes += Number(row.likes || 0);
      acc.comments += Number(row.comments || 0);
      acc.shares += Number(row.shares || 0);
      acc.saves += Number(row.saves || 0);
      acc.reach += Number(row.reach || 0);
      acc.impressions += Number(row.impressions || 0);
      return acc;
    },
    { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0 },
  );
  const interactions = totals.likes + totals.comments + totals.shares + totals.saves;
  return {
    totals: {
      ...totals,
      interactions,
      engagementRate: totals.impressions ? (interactions / totals.impressions) * 100 : 0,
    },
    series: rows,
    topContent: [...rows]
      .sort((a, b) =>
        Number(b.likes || 0) + Number(b.comments || 0) + Number(b.shares || 0) -
        (Number(a.likes || 0) + Number(a.comments || 0) + Number(a.shares || 0)),
      )
      .slice(0, 10),
  };
}
