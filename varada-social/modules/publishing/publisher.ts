export type PublishablePlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "x"
  | "threads"
  | "pinterest"
  | "google_business"
  | "youtube_community";

export interface PublishRequest {
  contentId: string;
  accountId: string;
  idempotencyKey: string;
  scheduledFor?: Date;
}

export interface PublishResult {
  externalId: string;
  permalink?: string;
  publishedAt: Date;
}

export interface SocialPublisher {
  readonly platform: PublishablePlatform;
  publish(request: PublishRequest): Promise<PublishResult>;
  validateAccount(accountId: string): Promise<boolean>;
  refreshCredentials(accountId: string): Promise<void>;
}
