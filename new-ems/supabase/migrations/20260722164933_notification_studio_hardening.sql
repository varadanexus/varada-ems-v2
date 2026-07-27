-- Explicitly narrow Supabase's automatic function grants and add FK indexes.

create index if not exists idx_notification_campaigns_created_by on public.notification_campaigns(created_by);
create index if not exists idx_notification_campaigns_event_id on public.notification_campaigns(notification_event_id) where notification_event_id is not null;
create index if not exists idx_notification_campaign_templates_created_by on public.notification_campaign_templates(created_by);

revoke all on function public.notification_studio_can_manage() from anon;
revoke all on function public.notification_studio_directory() from anon;
revoke all on function public.preview_notification_campaign_audience(text,jsonb,boolean) from anon;
revoke all on function public.save_notification_campaign(jsonb) from anon;
revoke all on function public.execute_notification_campaign_internal(uuid) from anon, authenticated;
revoke all on function public.publish_notification_campaign(uuid) from anon;
revoke all on function public.process_due_notification_campaigns(integer) from anon, authenticated;
revoke all on function public.list_notification_campaigns(text,integer) from anon;
revoke all on function public.get_notification_campaign(uuid) from anon;
revoke all on function public.cancel_notification_campaign(uuid) from anon;
revoke all on function public.list_notification_campaign_templates() from anon;
revoke all on function public.save_notification_campaign_template(jsonb) from anon;

grant execute on function public.execute_notification_campaign_internal(uuid) to service_role;
grant execute on function public.process_due_notification_campaigns(integer) to service_role;
