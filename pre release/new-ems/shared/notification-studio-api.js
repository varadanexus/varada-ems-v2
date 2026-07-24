import { getSupabaseClient } from "../config/supabase.js";

const client = () => getSupabaseClient();
const rpc = async (name, args = {}) => {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data;
};

export const getNotificationDirectory = () =>
  rpc("notification_studio_directory");
export const previewCampaignAudience = (
  audienceMode,
  audience,
  respectPreferences,
) =>
  rpc("preview_notification_campaign_audience", {
    p_audience_mode: audienceMode,
    p_audience: audience || {},
    p_respect_preferences: respectPreferences,
  });
export const saveCampaign = (payload) =>
  rpc("save_notification_campaign", { p_payload: payload });
async function dispatchCampaignEvent(eventId) {
  if (!eventId) return { eventId: null, channels: [] };
  const { data, error } = await client().functions.invoke(
    "notification-campaigns",
    { body: { action: "dispatch_event", notificationId: eventId } },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { eventId, ...(data || {}) };
}
export async function publishCampaign(id) {
  const eventId = await rpc("publish_notification_campaign", {
    p_campaign_id: id,
  });
  return dispatchCampaignEvent(eventId);
}
export const listCampaigns = (status = "all", limit = 150) =>
  rpc("list_notification_campaigns", { p_status: status, p_limit: limit });
export const getCampaign = (id) =>
  rpc("get_notification_campaign", { p_campaign_id: id });
export const cancelCampaign = (id) =>
  rpc("cancel_notification_campaign", { p_campaign_id: id });
export const listCampaignTemplates = () =>
  rpc("list_notification_campaign_templates");
export const saveCampaignTemplate = (payload) =>
  rpc("save_notification_campaign_template", { p_payload: payload });
export const getCampaignDeliveryBreakdown = (id) =>
  rpc("notification_studio_delivery_breakdown", { p_campaign_id: id });
export async function retryCampaignDelivery(id) {
  const campaign = await getCampaign(id);
  if (!campaign?.notification_event_id)
    throw new Error("This campaign has not been dispatched yet.");
  return dispatchCampaignEvent(campaign.notification_event_id);
}
