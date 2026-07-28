export type ContentStatus =
  | "draft"
  | "manager_review"
  | "admin_review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "rejected"
  | "failed"
  | "archived";

export type SocialContentItem = {
  id: string;
  title: string;
  format: string;
  status: ContentStatus;
  platforms: string[];
  topic: string | null;
  objective: string | null;
  tone: string | null;
  content_package: Record<string, unknown>;
  scheduled_for: string | null;
  published_at: string | null;
  rejection_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type DashboardData = {
  userName: string;
  metrics: {
    today: number;
    scheduled: number;
    published: number;
    drafts: number;
    pendingApprovals: number;
    reach: number;
    impressions: number;
    interactions: number;
    engagementRate: number;
    followerGrowth: number;
  };
  pipeline: Record<string, number>;
  engagementSeries: Array<{ date: string; interactions: number }>;
  upcoming: SocialContentItem[];
  trends: Array<{
    id: string;
    title: string;
    signal_type: string;
    score: number;
    source: string | null;
  }>;
  recommendation: string | null;
  accountsConnected: number;
  hasAnalytics: boolean;
};
