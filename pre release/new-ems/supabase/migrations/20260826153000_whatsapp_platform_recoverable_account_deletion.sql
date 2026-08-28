-- Recoverable customer-account deletion with retained Drive evidence.
create table if not exists public.whatsapp_platform_account_deletion_requests (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,tenant_name text not null,owner_email text,
 requested_by_description text not null,internal_note text not null,actor_app_user_id uuid,actor_name text,actor_email text,
 evidence_drive_file_id text not null,evidence_drive_folder_id text not null,evidence_file_name text not null,
 evidence_mime_type text not null,evidence_sha256 text not null,latitude numeric(10,7) not null,longitude numeric(10,7) not null,
 location_accuracy_m numeric(10,2),location_captured_at timestamptz not null,consent_confirmed_at timestamptz not null,
 requested_at timestamptz not null default now(),scheduled_for timestamptz not null default(now()+interval '24 hours'),
 status text not null default 'pending' check(status in('pending','reversed','executed','blocked')),
 reversed_at timestamptz,reversed_by_user_id uuid,reversed_by_email text,reversal_reason text,executed_at timestamptz,
 blocked_reason text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index if not exists whatsapp_platform_one_pending_account_deletion on public.whatsapp_platform_account_deletion_requests(tenant_id) where status='pending';
create index if not exists whatsapp_platform_account_deletion_due_idx on public.whatsapp_platform_account_deletion_requests(status,scheduled_for);
alter table public.whatsapp_platform_account_deletion_requests enable row level security;
revoke all on table public.whatsapp_platform_account_deletion_requests from public,anon,authenticated;
grant all on table public.whatsapp_platform_account_deletion_requests to service_role;

create or replace function public.whatsapp_platform_account_deletion_status(p_session_token text) returns jsonb
language plpgsql security definer set search_path=public as $$ declare v_customer record;v_request record;begin
 select * into v_customer from public.whatsapp_platform_validate_session(p_session_token) limit 1;
 if v_customer.tenant_id is null then raise exception 'Unauthorized' using errcode='42501';end if;
 select * into v_request from public.whatsapp_platform_account_deletion_requests where tenant_id=v_customer.tenant_id and status='pending' order by requested_at desc limit 1;
 if not found then return jsonb_build_object('pending',false);end if;
 return jsonb_build_object('pending',true,'requestId',v_request.id,'requestedAt',v_request.requested_at,'scheduledFor',v_request.scheduled_for,'canReverse',v_customer.role_code in('owner','admin') and v_request.scheduled_for>now());end $$;

create or replace function public.whatsapp_platform_reverse_account_deletion(p_session_token text,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public as $$ declare v_customer record;v_request record;begin
 select * into v_customer from public.whatsapp_platform_validate_session(p_session_token) limit 1;
 if v_customer.tenant_id is null then raise exception 'Unauthorized' using errcode='42501';end if;
 if v_customer.role_code not in('owner','admin') then raise exception 'Only a workspace owner or administrator can reverse deletion.' using errcode='42501';end if;
 select * into v_request from public.whatsapp_platform_account_deletion_requests where tenant_id=v_customer.tenant_id and status='pending' order by requested_at desc limit 1 for update;
 if not found then raise exception 'No pending deletion request was found.';end if;
 if v_request.scheduled_for<=now() then raise exception 'The 24-hour reversal window has ended.';end if;
 update public.whatsapp_platform_account_deletion_requests set status='reversed',reversed_at=now(),reversed_by_user_id=v_customer.user_id,reversed_by_email=v_customer.email,reversal_reason=nullif(trim(coalesce(p_reason,'')),''),updated_at=now() where id=v_request.id;
 insert into public.audit_logs(event_type,action,module_code,entity_type,entity_id,details) values('whatsapp_platform_account_deletion_reversed','reverse_account_deletion','whatsapp-platform','whatsapp_platform_account_deletion_requests',v_request.id,jsonb_build_object('tenant_id',v_request.tenant_id,'reversed_by_user_id',v_customer.user_id,'reversed_by_email',v_customer.email,'reason',nullif(trim(coalesce(p_reason,'')),'')));
 return jsonb_build_object('success',true,'requestId',v_request.id,'status','reversed');end $$;
revoke all on function public.whatsapp_platform_account_deletion_status(text) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_reverse_account_deletion(text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_account_deletion_status(text) to service_role;
grant execute on function public.whatsapp_platform_reverse_account_deletion(text,text) to service_role;

create or replace function public.whatsapp_platform_finalize_due_account_deletions() returns void language plpgsql security definer set search_path=public as $$ declare v_request record;begin
 for v_request in select * from public.whatsapp_platform_account_deletion_requests where status='pending' and scheduled_for<=now() order by scheduled_for for update skip locked loop begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.whatsapp_platform_admin_hard_delete_tenant(v_request.tenant_id,v_request.tenant_name,v_request.actor_app_user_id);
  update public.whatsapp_platform_account_deletion_requests set status='executed',executed_at=now(),updated_at=now(),blocked_reason=null where id=v_request.id;
 exception when others then update public.whatsapp_platform_account_deletion_requests set status='blocked',blocked_reason=left(sqlerrm,1000),updated_at=now() where id=v_request.id;end;end loop;end $$;
revoke all on function public.whatsapp_platform_finalize_due_account_deletions() from public,anon,authenticated;
grant execute on function public.whatsapp_platform_finalize_due_account_deletions() to service_role;
do $$ begin if exists(select 1 from pg_extension where extname='pg_cron') then
 if exists(select 1 from cron.job where jobname='whatsapp-platform-finalize-account-deletions') then perform cron.unschedule('whatsapp-platform-finalize-account-deletions');end if;
 perform cron.schedule('whatsapp-platform-finalize-account-deletions','*/5 * * * *','select public.whatsapp_platform_finalize_due_account_deletions();');end if;end $$;
notify pgrst,'reload schema';
