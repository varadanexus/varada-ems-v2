drop extension if exists "pg_net";

create sequence "public"."permissions_id_seq";


  create table "public"."activity_logs" (
    "id" bigint generated always as identity not null,
    "auth_id" uuid,
    "user_id" uuid,
    "action_type" text not null,
    "module_name" text,
    "page_name" text,
    "description" text,
    "metadata" jsonb default '{}'::jsonb,
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."agent_commissions" (
    "id" uuid not null default gen_random_uuid(),
    "agent_id" uuid,
    "type" text,
    "value" numeric,
    "created_at" timestamp without time zone default now(),
    "commission_type" text default 'percentage'::text,
    "commission_value" numeric
      );



  create table "public"."agent_trip_ledger" (
    "id" uuid not null default gen_random_uuid(),
    "trip_id" uuid not null,
    "agent_id" uuid not null,
    "commission_type" text not null,
    "commission_value" numeric not null,
    "commission_amount" numeric not null default 0,
    "created_at" timestamp without time zone default now(),
    "payment_status" text default 'pending'::text,
    "paid_amount" numeric default 0
      );



  create table "public"."agent_withdraw_requests" (
    "id" uuid not null default gen_random_uuid(),
    "agent_id" uuid,
    "amount" numeric not null,
    "status" text default 'pending'::text,
    "requested_at" timestamp without time zone default now(),
    "processed_at" timestamp without time zone
      );



  create table "public"."agents" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "phone" text,
    "created_at" timestamp without time zone default now(),
    "auth_id" uuid,
    "is_active" boolean default true,
    "email" text
      );



  create table "public"."audit_logs" (
    "id" uuid not null default gen_random_uuid(),
    "action" text,
    "agent_id" uuid,
    "amount" numeric,
    "reference_id" uuid,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."audit_trail" (
    "id" uuid not null default gen_random_uuid(),
    "table_name" text,
    "record_id" text,
    "action" text,
    "old_data" jsonb,
    "new_data" jsonb,
    "changed_by" uuid,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."client_invoices" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "invoice_no" text,
    "trip_id" uuid,
    "trip_no" text,
    "client_name" text,
    "route" text,
    "truck" text,
    "commodity" text,
    "weight_kg" numeric,
    "rate_per_mt" numeric,
    "invoice_amount" numeric,
    "invoice_date" date default now(),
    "status" text default 'Pending'::text,
    "created_at" timestamp without time zone default now(),
    "amount_paid" numeric default 0,
    "balance_amount" numeric,
    "payment_status" text default 'Pending'::text,
    "is_gst" boolean default false
      );



  create table "public"."client_invoices_gst" (
    "id" uuid not null default gen_random_uuid(),
    "invoice_no" text,
    "client_name" text,
    "total_contract_val" numeric,
    "total_freight" numeric,
    "total_margin" numeric,
    "gst_total" numeric,
    "invoice_amount" numeric,
    "balance_amount" numeric,
    "payment_status" text default 'Pending'::text,
    "created_at" timestamp without time zone default now(),
    "gst_type" text default 'excluded'::text,
    "gst_on" text default 'margin'::text,
    "total_expense" numeric(12,2),
    "net_billing" numeric(12,2),
    "gst_percent" numeric(5,2) default 18,
    "cgst" numeric(12,2),
    "sgst" numeric(12,2),
    "hsn_code" text,
    "gst_no" text,
    "drive_file_id" text,
    "drive_link" text
      );



  create table "public"."client_payments" (
    "id" uuid not null default gen_random_uuid(),
    "trip_id" uuid,
    "client_name" text,
    "amount" numeric,
    "payment_date" date,
    "created_at" timestamp without time zone default now(),
    "invoice_id" uuid,
    "invoice_no" text,
    "payment_method" text,
    "remarks" text,
    "billing_type" text
      );



  create table "public"."clients" (
    "id" uuid not null default gen_random_uuid(),
    "client_name" text,
    "company" text,
    "phone" text,
    "email" text,
    "created_at" timestamp with time zone not null default now(),
    "gst_no" text,
    "address" text,
    "contact_person" text,
    "aadhar_no" text,
    "pan_no" text
      );



  create table "public"."commodities" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "created_at" timestamp with time zone not null default now(),
    "commodity_id" uuid default gen_random_uuid()
      );



  create table "public"."company_ledger" (
    "id" uuid not null default gen_random_uuid(),
    "entry_date" timestamp without time zone default now(),
    "reference_no" text,
    "party" text,
    "debit" numeric default 0,
    "credit" numeric default 0,
    "balance" numeric default 0,
    "remarks" text,
    "payment_method" text,
    "transaction_id" text,
    "payment_date" date,
    "created_at" timestamp without time zone default now(),
    "payment_id" uuid,
    "entry_type" text
      );



  create table "public"."credentials" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "meeting_id" uuid,
    "role" text,
    "is_active" boolean default true,
    "created_at" timestamp without time zone default now(),
    "phone" text,
    "name" text,
    "is_approved" boolean default false,
    "status" text default 'offline'::text
      );



  create table "public"."expenses" (
    "id" uuid not null default gen_random_uuid(),
    "trip_id" uuid,
    "expense_type" text,
    "amount" numeric,
    "expense_date" date,
    "created_at" timestamp without time zone default now(),
    "expense_id" text
      );



  create table "public"."gst_credit_notes" (
    "id" uuid not null default gen_random_uuid(),
    "invoice_id" uuid,
    "invoice_no" text,
    "credit_note_no" text,
    "client_name" text,
    "amount" numeric,
    "reason" text,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."gst_payments" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "invoice_id" uuid,
    "invoice_no" text,
    "client_name" text,
    "amount" numeric,
    "payment_method" text,
    "transaction_id" text,
    "payment_date" timestamp without time zone,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."interior_projects" (
    "id" uuid not null default gen_random_uuid(),
    "project_name" text,
    "client_name" text,
    "phone" text,
    "site_address" text,
    "budget" numeric default 0,
    "start_date" date,
    "status" text default 'Planning'::text,
    "project_manager" text,
    "created_at" timestamp with time zone default now(),
    "client_email" text
      );



  create table "public"."inventory_items" (
    "id" uuid not null default gen_random_uuid(),
    "item_name" text,
    "quantity" numeric,
    "unit" text,
    "status" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."invoice_trip_breakdown" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "invoice_id" uuid,
    "trip_no" text,
    "amount" numeric,
    "created_at" timestamp without time zone default now(),
    "contract_rate" numeric,
    "transporter_rate" numeric,
    "contract_value" numeric,
    "freight_cost" numeric,
    "margin" numeric,
    "gst" numeric
      );



  create table "public"."invoice_trip_breakdown_gst" (
    "id" uuid not null default gen_random_uuid(),
    "invoice_id" uuid,
    "trip_id" uuid,
    "trip_no" text,
    "contract_rate" numeric,
    "transporter_rate" numeric,
    "contract_value" numeric,
    "freight_cost" numeric,
    "margin" numeric,
    "gst" numeric,
    "created_at" timestamp without time zone default now(),
    "truck_no" text
      );



  create table "public"."ledger_entries" (
    "id" uuid not null default gen_random_uuid(),
    "entry_date" timestamp without time zone default now(),
    "account" text,
    "type" text,
    "amount" numeric,
    "reference_type" text,
    "reference_id" uuid,
    "description" text
      );



  create table "public"."meetings" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "title" text,
    "room_name" text,
    "status" text default 'active'::text,
    "created_at" timestamp without time zone default now(),
    "scheduled_at" timestamp without time zone,
    "duration_minutes" integer default 30,
    "scheduled_local" text
      );



  create table "public"."otp_logins" (
    "phone" text,
    "otp" text,
    "expires_at" timestamp without time zone,
    "verified" boolean default false
      );


alter table "public"."otp_logins" enable row level security;


  create table "public"."permissions" (
    "id" integer not null default nextval('public.permissions_id_seq'::regclass),
    "permission_name" text
      );



  create table "public"."project_expenses" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "expense_type" text,
    "amount" numeric default 0,
    "notes" text,
    "expense_date" date,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."project_inventory" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "item_name" text,
    "quantity" numeric default 0,
    "unit" text,
    "cost" numeric default 0,
    "vendor" text,
    "notes" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."project_site_photos" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "photo_url" text,
    "drive_file_id" text,
    "caption" text,
    "upload_date" date,
    "created_at" timestamp with time zone default now(),
    "ai_summary" text
      );



  create table "public"."project_tasks" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "task_name" text,
    "assigned_to" text,
    "start_date" date,
    "deadline" date,
    "progress" numeric default 0,
    "status" text default 'Pending'::text,
    "remarks" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."rates" (
    "id" uuid not null default gen_random_uuid(),
    "commodity_id" uuid default gen_random_uuid(),
    "route_id" uuid default gen_random_uuid(),
    "company_rate_per_mt" numeric,
    "transporter_rate_per_mt" numeric,
    "created_at" timestamp with time zone not null default now(),
    "transporter_id" uuid default gen_random_uuid()
      );



  create table "public"."role_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "role_id" integer,
    "can_access" boolean default false,
    "created_at" timestamp without time zone default now(),
    "page_name" text,
    "action_name" text not null default 'view'::text
      );



  create table "public"."role_routes" (
    "id" bigint generated always as identity not null,
    "role_name" text not null,
    "redirect_path" text not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."roles" (
    "id" smallint generated by default as identity not null,
    "role_name" text,
    "created_at" timestamp without time zone not null default now()
      );



  create table "public"."routes" (
    "id" uuid not null default gen_random_uuid(),
    "origin" text not null,
    "destination" text not null,
    "route_code" text,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."stock_movements" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "item_name" text,
    "movement_type" text,
    "quantity" numeric default 0,
    "unit" text,
    "notes" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."system_settings" (
    "id" integer not null,
    "maintenance_mode" boolean default false,
    "message" text,
    "updated_at" timestamp without time zone default now(),
    "maintenance_version" integer default 1
      );



  create table "public"."transporter_adjustments" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "transporter_id" uuid,
    "trip_id" uuid,
    "invoice_id" uuid,
    "type" text,
    "amount" numeric,
    "reason" text,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."transporter_invoices" (
    "id" uuid not null default gen_random_uuid(),
    "invoice_no" text,
    "transporter_id" uuid,
    "trip_ids" text,
    "total_amount" numeric,
    "paid_amount" numeric default 0,
    "balance_amount" numeric,
    "status" text default 'Pending'::text,
    "created_at" timestamp without time zone default now(),
    "drive_file_id" text,
    "drive_link" text
      );



  create table "public"."transporter_ledger" (
    "id" uuid not null default gen_random_uuid(),
    "transporter_id" uuid,
    "trip_id" uuid,
    "amount" numeric,
    "type" text,
    "remarks" text,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."transporter_payments" (
    "id" uuid not null default gen_random_uuid(),
    "trip_id" uuid,
    "transporter_name" text,
    "amount" numeric,
    "payment_date" date,
    "created_at" timestamp without time zone default now(),
    "transaction_id" text,
    "remarks" text,
    "payment_method" text,
    "invoice_id" uuid
      );



  create table "public"."transporters" (
    "id" uuid not null default gen_random_uuid(),
    "transporter_name" text,
    "company" text,
    "phone" text,
    "truck_number" text,
    "created_at" timestamp with time zone not null default now(),
    "pan" text,
    "auth_id" uuid,
    "gst_number" text,
    "address" text,
    "aadhar_number" text,
    "bank_name" text,
    "account_number" text,
    "ifsc_code" text,
    "status" text default 'Active'::text,
    "user_id" uuid
      );



  create table "public"."trip_agents" (
    "id" uuid not null default gen_random_uuid(),
    "trip_id" uuid,
    "agent_id" uuid,
    "commission_type" text,
    "commission_value" numeric,
    "commission_amount" numeric,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."trip_documents" (
    "id" uuid not null default gen_random_uuid(),
    "trip_id" text not null,
    "file_name" text,
    "file_type" text,
    "file_url" text,
    "file_id" text,
    "created_at" timestamp with time zone default now(),
    "trip_no" text,
    "doc_type" text
      );



  create table "public"."trips" (
    "id" uuid not null default gen_random_uuid(),
    "route_id" uuid,
    "truck_id" uuid,
    "commodity" text,
    "weight_kg" numeric,
    "trip_date" date,
    "status" text,
    "created_at" timestamp without time zone default now(),
    "route" text,
    "truck" text,
    "trip_no" text,
    "company_rate" numeric,
    "transporter_rate" numeric,
    "transporter_id" uuid,
    "client_name" text,
    "invoice_id" uuid,
    "client_id" uuid,
    "commodity_id" uuid,
    "commission_amount" numeric,
    "load_mt" numeric,
    "rate" numeric,
    "total_amount" numeric,
    "billing_status" text default 'Pending'::text
      );



  create table "public"."truck_agents" (
    "id" bigint generated by default as identity not null,
    "truck_id" uuid,
    "agent_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "commission_type" text default 'percentage'::text,
    "commission_value" numeric
      );



  create table "public"."trucks" (
    "id" uuid not null default gen_random_uuid(),
    "truck_number" text not null,
    "transporter_id" uuid,
    "created_at" timestamp without time zone default now(),
    "truck_id" text,
    "driver_name" text,
    "driver_phone" text,
    "agent_id" uuid
      );



  create table "public"."user_contacts" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "phone" text,
    "role" text
      );



  create table "public"."user_roles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid default gen_random_uuid(),
    "role_id" integer,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."users" (
    "id" uuid not null default gen_random_uuid(),
    "email" text,
    "created_at" timestamp with time zone not null default now(),
    "auth_id" uuid,
    "is_admin" boolean default false,
    "session_token" text
      );



  create table "public"."whatsapp_chats" (
    "id" uuid not null default gen_random_uuid(),
    "phone" text,
    "name" text,
    "last_message" text,
    "last_message_at" timestamp with time zone default now(),
    "unread_count" integer default 0,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."whatsapp_logs" (
    "id" uuid default extensions.uuid_generate_v4(),
    "phone" text,
    "template" text,
    "status" text,
    "created_at" timestamp without time zone default now()
      );



  create table "public"."whatsapp_messages" (
    "id" uuid not null default gen_random_uuid(),
    "phone" text,
    "name" text,
    "direction" text,
    "message" text,
    "message_sid" text,
    "status" text,
    "media_url" text,
    "created_at" timestamp with time zone default now(),
    "chat_id" uuid
      );



  create table "public"."whatsapp_presence" (
    "id" uuid not null default gen_random_uuid(),
    "phone" text,
    "name" text,
    "is_online" boolean default false,
    "is_typing" boolean default false,
    "last_seen" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );



  create table "public"."work_progress" (
    "id" uuid not null default gen_random_uuid(),
    "work_name" text,
    "assigned_to" text,
    "progress" numeric,
    "status" text,
    "created_at" timestamp with time zone default now()
      );


alter sequence "public"."permissions_id_seq" owned by "public"."permissions"."id";

CREATE UNIQUE INDEX activity_logs_pkey ON public.activity_logs USING btree (id);

CREATE UNIQUE INDEX agent_commissions_pkey ON public.agent_commissions USING btree (id);

CREATE UNIQUE INDEX agent_trip_ledger_pkey ON public.agent_trip_ledger USING btree (id);

CREATE UNIQUE INDEX agent_trip_ledger_trip_id_agent_id_key ON public.agent_trip_ledger USING btree (trip_id, agent_id);

CREATE UNIQUE INDEX agent_withdraw_requests_pkey ON public.agent_withdraw_requests USING btree (id);

CREATE UNIQUE INDEX agents_pkey ON public.agents USING btree (id);

CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE UNIQUE INDEX audit_trail_pkey ON public.audit_trail USING btree (id);

CREATE UNIQUE INDEX client_invoices_gst_pkey ON public.client_invoices_gst USING btree (id);

CREATE UNIQUE INDEX client_invoices_pkey ON public.client_invoices USING btree (id);

CREATE UNIQUE INDEX client_payments_pkey ON public.client_payments USING btree (id);

CREATE UNIQUE INDEX clients_pkey ON public.clients USING btree (id);

CREATE UNIQUE INDEX commodities_pkey ON public.commodities USING btree (id);

CREATE UNIQUE INDEX company_ledger_pkey ON public.company_ledger USING btree (id);

CREATE UNIQUE INDEX credentials_pkey ON public.credentials USING btree (id);

CREATE UNIQUE INDEX expenses_pkey ON public.expenses USING btree (id);

CREATE UNIQUE INDEX gst_credit_notes_pkey ON public.gst_credit_notes USING btree (id);

CREATE UNIQUE INDEX gst_payments_pkey ON public.gst_payments USING btree (id);

CREATE INDEX idx_client_gst_client ON public.client_invoices_gst USING btree (client_name);

CREATE INDEX idx_gst_invoice_id ON public.invoice_trip_breakdown_gst USING btree (invoice_id);

CREATE INDEX idx_gst_trip_no ON public.invoice_trip_breakdown_gst USING btree (trip_no);

CREATE INDEX idx_trip_documents_trip_id ON public.trip_documents USING btree (trip_id);

CREATE UNIQUE INDEX interior_projects_pkey ON public.interior_projects USING btree (id);

CREATE UNIQUE INDEX inventory_items_pkey ON public.inventory_items USING btree (id);

CREATE UNIQUE INDEX invoice_trip_breakdown_gst_pkey ON public.invoice_trip_breakdown_gst USING btree (id);

CREATE UNIQUE INDEX invoice_trip_breakdown_pkey ON public.invoice_trip_breakdown USING btree (id);

CREATE UNIQUE INDEX ledger_entries_pkey ON public.ledger_entries USING btree (id);

CREATE UNIQUE INDEX meetings_pkey ON public.meetings USING btree (id);

CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (id);

CREATE UNIQUE INDEX project_expenses_pkey ON public.project_expenses USING btree (id);

CREATE UNIQUE INDEX project_inventory_pkey ON public.project_inventory USING btree (id);

CREATE UNIQUE INDEX project_site_photos_pkey ON public.project_site_photos USING btree (id);

CREATE UNIQUE INDEX project_tasks_pkey ON public.project_tasks USING btree (id);

CREATE UNIQUE INDEX rates_pkey ON public.rates USING btree (id);

CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (id);

CREATE UNIQUE INDEX role_routes_pkey ON public.role_routes USING btree (id);

CREATE UNIQUE INDEX role_routes_role_name_key ON public.role_routes USING btree (role_name);

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id);

CREATE UNIQUE INDEX routes_pkey ON public.routes USING btree (id);

CREATE UNIQUE INDEX stock_movements_pkey ON public.stock_movements USING btree (id);

CREATE UNIQUE INDEX system_settings_pkey ON public.system_settings USING btree (id);

CREATE UNIQUE INDEX transporter_adjustments_pkey ON public.transporter_adjustments USING btree (id);

CREATE UNIQUE INDEX transporter_invoices_pkey ON public.transporter_invoices USING btree (id);

CREATE UNIQUE INDEX transporter_ledger_pkey ON public.transporter_ledger USING btree (id);

CREATE UNIQUE INDEX transporter_payments_pkey ON public.transporter_payments USING btree (id);

CREATE UNIQUE INDEX transporters_pkey ON public.transporters USING btree (id);

CREATE UNIQUE INDEX trip_agents_pkey ON public.trip_agents USING btree (id);

CREATE UNIQUE INDEX trip_documents_pkey ON public.trip_documents USING btree (id);

CREATE UNIQUE INDEX trips_pkey ON public.trips USING btree (id);

CREATE UNIQUE INDEX truck_agents_pkey ON public.truck_agents USING btree (id);

CREATE UNIQUE INDEX trucks_pkey ON public.trucks USING btree (id);

CREATE UNIQUE INDEX unique_agent ON public.agent_commissions USING btree (agent_id);

CREATE UNIQUE INDEX unique_role_page_action ON public.role_permissions USING btree (role_id, page_name, action_name);

CREATE UNIQUE INDEX unique_truck_agent ON public.truck_agents USING btree (truck_id, agent_id);

CREATE UNIQUE INDEX user_contacts_pkey ON public.user_contacts USING btree (id);

CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id);

CREATE UNIQUE INDEX user_roles_user_id_unique ON public.user_roles USING btree (user_id);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

CREATE UNIQUE INDEX whatsapp_chats_phone_key ON public.whatsapp_chats USING btree (phone);

CREATE UNIQUE INDEX whatsapp_chats_pkey ON public.whatsapp_chats USING btree (id);

CREATE UNIQUE INDEX whatsapp_messages_pkey ON public.whatsapp_messages USING btree (id);

CREATE UNIQUE INDEX whatsapp_presence_phone_key ON public.whatsapp_presence USING btree (phone);

CREATE UNIQUE INDEX whatsapp_presence_pkey ON public.whatsapp_presence USING btree (id);

CREATE UNIQUE INDEX work_progress_pkey ON public.work_progress USING btree (id);

alter table "public"."activity_logs" add constraint "activity_logs_pkey" PRIMARY KEY using index "activity_logs_pkey";

alter table "public"."agent_commissions" add constraint "agent_commissions_pkey" PRIMARY KEY using index "agent_commissions_pkey";

alter table "public"."agent_trip_ledger" add constraint "agent_trip_ledger_pkey" PRIMARY KEY using index "agent_trip_ledger_pkey";

alter table "public"."agent_withdraw_requests" add constraint "agent_withdraw_requests_pkey" PRIMARY KEY using index "agent_withdraw_requests_pkey";

alter table "public"."agents" add constraint "agents_pkey" PRIMARY KEY using index "agents_pkey";

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY using index "audit_logs_pkey";

alter table "public"."audit_trail" add constraint "audit_trail_pkey" PRIMARY KEY using index "audit_trail_pkey";

alter table "public"."client_invoices" add constraint "client_invoices_pkey" PRIMARY KEY using index "client_invoices_pkey";

alter table "public"."client_invoices_gst" add constraint "client_invoices_gst_pkey" PRIMARY KEY using index "client_invoices_gst_pkey";

alter table "public"."client_payments" add constraint "client_payments_pkey" PRIMARY KEY using index "client_payments_pkey";

alter table "public"."clients" add constraint "clients_pkey" PRIMARY KEY using index "clients_pkey";

alter table "public"."commodities" add constraint "commodities_pkey" PRIMARY KEY using index "commodities_pkey";

alter table "public"."company_ledger" add constraint "company_ledger_pkey" PRIMARY KEY using index "company_ledger_pkey";

alter table "public"."credentials" add constraint "credentials_pkey" PRIMARY KEY using index "credentials_pkey";

alter table "public"."expenses" add constraint "expenses_pkey" PRIMARY KEY using index "expenses_pkey";

alter table "public"."gst_credit_notes" add constraint "gst_credit_notes_pkey" PRIMARY KEY using index "gst_credit_notes_pkey";

alter table "public"."gst_payments" add constraint "gst_payments_pkey" PRIMARY KEY using index "gst_payments_pkey";

alter table "public"."interior_projects" add constraint "interior_projects_pkey" PRIMARY KEY using index "interior_projects_pkey";

alter table "public"."inventory_items" add constraint "inventory_items_pkey" PRIMARY KEY using index "inventory_items_pkey";

alter table "public"."invoice_trip_breakdown" add constraint "invoice_trip_breakdown_pkey" PRIMARY KEY using index "invoice_trip_breakdown_pkey";

alter table "public"."invoice_trip_breakdown_gst" add constraint "invoice_trip_breakdown_gst_pkey" PRIMARY KEY using index "invoice_trip_breakdown_gst_pkey";

alter table "public"."ledger_entries" add constraint "ledger_entries_pkey" PRIMARY KEY using index "ledger_entries_pkey";

alter table "public"."meetings" add constraint "meetings_pkey" PRIMARY KEY using index "meetings_pkey";

alter table "public"."permissions" add constraint "permissions_pkey" PRIMARY KEY using index "permissions_pkey";

alter table "public"."project_expenses" add constraint "project_expenses_pkey" PRIMARY KEY using index "project_expenses_pkey";

alter table "public"."project_inventory" add constraint "project_inventory_pkey" PRIMARY KEY using index "project_inventory_pkey";

alter table "public"."project_site_photos" add constraint "project_site_photos_pkey" PRIMARY KEY using index "project_site_photos_pkey";

alter table "public"."project_tasks" add constraint "project_tasks_pkey" PRIMARY KEY using index "project_tasks_pkey";

alter table "public"."rates" add constraint "rates_pkey" PRIMARY KEY using index "rates_pkey";

alter table "public"."role_permissions" add constraint "role_permissions_pkey" PRIMARY KEY using index "role_permissions_pkey";

alter table "public"."role_routes" add constraint "role_routes_pkey" PRIMARY KEY using index "role_routes_pkey";

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."routes" add constraint "routes_pkey" PRIMARY KEY using index "routes_pkey";

alter table "public"."stock_movements" add constraint "stock_movements_pkey" PRIMARY KEY using index "stock_movements_pkey";

alter table "public"."system_settings" add constraint "system_settings_pkey" PRIMARY KEY using index "system_settings_pkey";

alter table "public"."transporter_adjustments" add constraint "transporter_adjustments_pkey" PRIMARY KEY using index "transporter_adjustments_pkey";

alter table "public"."transporter_invoices" add constraint "transporter_invoices_pkey" PRIMARY KEY using index "transporter_invoices_pkey";

alter table "public"."transporter_ledger" add constraint "transporter_ledger_pkey" PRIMARY KEY using index "transporter_ledger_pkey";

alter table "public"."transporter_payments" add constraint "transporter_payments_pkey" PRIMARY KEY using index "transporter_payments_pkey";

alter table "public"."transporters" add constraint "transporters_pkey" PRIMARY KEY using index "transporters_pkey";

alter table "public"."trip_agents" add constraint "trip_agents_pkey" PRIMARY KEY using index "trip_agents_pkey";

alter table "public"."trip_documents" add constraint "trip_documents_pkey" PRIMARY KEY using index "trip_documents_pkey";

alter table "public"."trips" add constraint "trips_pkey" PRIMARY KEY using index "trips_pkey";

alter table "public"."truck_agents" add constraint "truck_agents_pkey" PRIMARY KEY using index "truck_agents_pkey";

alter table "public"."trucks" add constraint "trucks_pkey" PRIMARY KEY using index "trucks_pkey";

alter table "public"."user_contacts" add constraint "user_contacts_pkey" PRIMARY KEY using index "user_contacts_pkey";

alter table "public"."user_roles" add constraint "user_roles_pkey" PRIMARY KEY using index "user_roles_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."whatsapp_chats" add constraint "whatsapp_chats_pkey" PRIMARY KEY using index "whatsapp_chats_pkey";

alter table "public"."whatsapp_messages" add constraint "whatsapp_messages_pkey" PRIMARY KEY using index "whatsapp_messages_pkey";

alter table "public"."whatsapp_presence" add constraint "whatsapp_presence_pkey" PRIMARY KEY using index "whatsapp_presence_pkey";

alter table "public"."work_progress" add constraint "work_progress_pkey" PRIMARY KEY using index "work_progress_pkey";

alter table "public"."agent_commissions" add constraint "agent_commissions_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE not valid;

alter table "public"."agent_commissions" validate constraint "agent_commissions_agent_id_fkey";

alter table "public"."agent_commissions" add constraint "fk_agent" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE not valid;

alter table "public"."agent_commissions" validate constraint "fk_agent";

alter table "public"."agent_commissions" add constraint "unique_agent" UNIQUE using index "unique_agent";

alter table "public"."agent_trip_ledger" add constraint "agent_trip_ledger_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE not valid;

alter table "public"."agent_trip_ledger" validate constraint "agent_trip_ledger_agent_id_fkey";

alter table "public"."agent_trip_ledger" add constraint "agent_trip_ledger_commission_type_check" CHECK ((commission_type = ANY (ARRAY['percentage'::text, 'per_mt'::text]))) not valid;

alter table "public"."agent_trip_ledger" validate constraint "agent_trip_ledger_commission_type_check";

alter table "public"."agent_trip_ledger" add constraint "agent_trip_ledger_trip_id_agent_id_key" UNIQUE using index "agent_trip_ledger_trip_id_agent_id_key";

alter table "public"."agent_trip_ledger" add constraint "agent_trip_ledger_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE not valid;

alter table "public"."agent_trip_ledger" validate constraint "agent_trip_ledger_trip_id_fkey";

alter table "public"."agent_withdraw_requests" add constraint "agent_withdraw_requests_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE not valid;

alter table "public"."agent_withdraw_requests" validate constraint "agent_withdraw_requests_agent_id_fkey";

alter table "public"."credentials" add constraint "credentials_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE not valid;

alter table "public"."credentials" validate constraint "credentials_meeting_id_fkey";

alter table "public"."expenses" add constraint "expenses_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES public.trips(id) not valid;

alter table "public"."expenses" validate constraint "expenses_trip_id_fkey";

alter table "public"."invoice_trip_breakdown" add constraint "fk_invoice" FOREIGN KEY (invoice_id) REFERENCES public.client_invoices(id) ON DELETE CASCADE not valid;

alter table "public"."invoice_trip_breakdown" validate constraint "fk_invoice";

alter table "public"."project_expenses" add constraint "project_expenses_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.interior_projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_expenses" validate constraint "project_expenses_project_id_fkey";

alter table "public"."project_inventory" add constraint "project_inventory_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.interior_projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_inventory" validate constraint "project_inventory_project_id_fkey";

alter table "public"."project_site_photos" add constraint "project_site_photos_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.interior_projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_site_photos" validate constraint "project_site_photos_project_id_fkey";

alter table "public"."project_tasks" add constraint "project_tasks_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.interior_projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_tasks" validate constraint "project_tasks_project_id_fkey";

alter table "public"."rates" add constraint "rates_transporter_id_fkey" FOREIGN KEY (transporter_id) REFERENCES public.transporters(id) not valid;

alter table "public"."rates" validate constraint "rates_transporter_id_fkey";

alter table "public"."role_permissions" add constraint "action_check" CHECK ((action_name = ANY (ARRAY['view'::text, 'create'::text, 'edit'::text, 'delete'::text]))) not valid;

alter table "public"."role_permissions" validate constraint "action_check";

alter table "public"."role_permissions" add constraint "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_role_id_fkey";

alter table "public"."role_permissions" add constraint "unique_role_page_action" UNIQUE using index "unique_role_page_action";

alter table "public"."role_routes" add constraint "role_routes_role_name_key" UNIQUE using index "role_routes_role_name_key";

alter table "public"."stock_movements" add constraint "stock_movements_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.interior_projects(id) ON DELETE CASCADE not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_project_id_fkey";

alter table "public"."system_settings" add constraint "system_settings_single_row" CHECK ((id = 1)) not valid;

alter table "public"."system_settings" validate constraint "system_settings_single_row";

alter table "public"."transporter_payments" add constraint "transporter_payments_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES public.trips(id) not valid;

alter table "public"."transporter_payments" validate constraint "transporter_payments_trip_id_fkey";

alter table "public"."trip_agents" add constraint "trip_agents_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(id) not valid;

alter table "public"."trip_agents" validate constraint "trip_agents_agent_id_fkey";

alter table "public"."trip_agents" add constraint "trip_agents_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES public.trips(id) not valid;

alter table "public"."trip_agents" validate constraint "trip_agents_trip_id_fkey";

alter table "public"."trips" add constraint "trips_client_fk" FOREIGN KEY (client_id) REFERENCES public.clients(id) not valid;

alter table "public"."trips" validate constraint "trips_client_fk";

alter table "public"."trips" add constraint "trips_route_id_fkey" FOREIGN KEY (route_id) REFERENCES public.routes(id) not valid;

alter table "public"."trips" validate constraint "trips_route_id_fkey";

alter table "public"."trips" add constraint "trips_truck_id_fkey" FOREIGN KEY (truck_id) REFERENCES public.trucks(id) not valid;

alter table "public"."trips" validate constraint "trips_truck_id_fkey";

alter table "public"."truck_agents" add constraint "fk_agent" FOREIGN KEY (agent_id) REFERENCES public.agents(id) not valid;

alter table "public"."truck_agents" validate constraint "fk_agent";

alter table "public"."truck_agents" add constraint "fk_truck" FOREIGN KEY (truck_id) REFERENCES public.trucks(id) not valid;

alter table "public"."truck_agents" validate constraint "fk_truck";

alter table "public"."truck_agents" add constraint "unique_truck_agent" UNIQUE using index "unique_truck_agent";

alter table "public"."trucks" add constraint "trucks_transporter_id_fkey" FOREIGN KEY (transporter_id) REFERENCES public.transporters(id) not valid;

alter table "public"."trucks" validate constraint "trucks_transporter_id_fkey";

alter table "public"."user_contacts" add constraint "user_contacts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) not valid;

alter table "public"."user_contacts" validate constraint "user_contacts_user_id_fkey";

alter table "public"."user_roles" add constraint "user_roles_user_id_unique" UNIQUE using index "user_roles_user_id_unique";

alter table "public"."whatsapp_chats" add constraint "whatsapp_chats_phone_key" UNIQUE using index "whatsapp_chats_phone_key";

alter table "public"."whatsapp_messages" add constraint "whatsapp_messages_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES public.whatsapp_chats(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."whatsapp_messages" validate constraint "whatsapp_messages_chat_id_fkey";

alter table "public"."whatsapp_presence" add constraint "whatsapp_presence_phone_key" UNIQUE using index "whatsapp_presence_phone_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.notify_trip_created()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  transporter_phone text;
  transporter_name text;
  manager_phone text;
  operator_phone text;
  weight_mt text;
begin

  -- transporter
  select phone, name into transporter_phone, transporter_name
  from transporters
  where id = new.transporter_id;

  -- manager
  select phone into manager_phone
  from user_contacts
  where role = 'manager'
  limit 1;

  -- operator
  select phone into operator_phone
  from user_contacts
  where role = 'operator'
  limit 1;

  -- kg → MT
  weight_mt := (new.weight_kg / 1000.0)::numeric(10,2)::text;

  -- transporter + manager
  perform net.http_post(
    url := 'https://ticsgbtxfhhihamejiss.supabase.co/functions/v1/send-whatsapp',
    headers := jsonb_build_object(
      'Content-Type','application/json'
    ),
    body := jsonb_build_object(
      'phones', jsonb_build_array(transporter_phone, manager_phone),
      'template','trip_update_api',
      'params', jsonb_build_array(
        transporter_name,
        new.route,
        new.truck,
        transporter_name,
        weight_mt
      )
    )
  );

  -- operator
  perform net.http_post(
    url := 'https://ticsgbtxfhhihamejiss.supabase.co/functions/v1/send-whatsapp',
    headers := jsonb_build_object(
      'Content-Type','application/json'
    ),
    body := jsonb_build_object(
      'phones', jsonb_build_array(operator_phone),
      'template','trip_update_api',
      'params', jsonb_build_array(
        'Operator',
        new.route,
        new.truck,
        transporter_name,
        weight_mt
      )
    )
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_auth_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT auth_id INTO NEW.auth_id
  FROM agents
  WHERE id = NEW.agent_id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_trip_transporter()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT transporter_id
  INTO NEW.transporter_id
  FROM trucks
  WHERE truck_number = NEW.truck;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_system_settings_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."activity_logs" to "anon";

grant insert on table "public"."activity_logs" to "anon";

grant references on table "public"."activity_logs" to "anon";

grant select on table "public"."activity_logs" to "anon";

grant trigger on table "public"."activity_logs" to "anon";

grant truncate on table "public"."activity_logs" to "anon";

grant update on table "public"."activity_logs" to "anon";

grant delete on table "public"."activity_logs" to "authenticated";

grant insert on table "public"."activity_logs" to "authenticated";

grant references on table "public"."activity_logs" to "authenticated";

grant select on table "public"."activity_logs" to "authenticated";

grant trigger on table "public"."activity_logs" to "authenticated";

grant truncate on table "public"."activity_logs" to "authenticated";

grant update on table "public"."activity_logs" to "authenticated";

grant delete on table "public"."activity_logs" to "service_role";

grant insert on table "public"."activity_logs" to "service_role";

grant references on table "public"."activity_logs" to "service_role";

grant select on table "public"."activity_logs" to "service_role";

grant trigger on table "public"."activity_logs" to "service_role";

grant truncate on table "public"."activity_logs" to "service_role";

grant update on table "public"."activity_logs" to "service_role";

grant delete on table "public"."agent_commissions" to "anon";

grant insert on table "public"."agent_commissions" to "anon";

grant references on table "public"."agent_commissions" to "anon";

grant select on table "public"."agent_commissions" to "anon";

grant trigger on table "public"."agent_commissions" to "anon";

grant truncate on table "public"."agent_commissions" to "anon";

grant update on table "public"."agent_commissions" to "anon";

grant delete on table "public"."agent_commissions" to "authenticated";

grant insert on table "public"."agent_commissions" to "authenticated";

grant references on table "public"."agent_commissions" to "authenticated";

grant select on table "public"."agent_commissions" to "authenticated";

grant trigger on table "public"."agent_commissions" to "authenticated";

grant truncate on table "public"."agent_commissions" to "authenticated";

grant update on table "public"."agent_commissions" to "authenticated";

grant delete on table "public"."agent_commissions" to "service_role";

grant insert on table "public"."agent_commissions" to "service_role";

grant references on table "public"."agent_commissions" to "service_role";

grant select on table "public"."agent_commissions" to "service_role";

grant trigger on table "public"."agent_commissions" to "service_role";

grant truncate on table "public"."agent_commissions" to "service_role";

grant update on table "public"."agent_commissions" to "service_role";

grant delete on table "public"."agent_trip_ledger" to "anon";

grant insert on table "public"."agent_trip_ledger" to "anon";

grant references on table "public"."agent_trip_ledger" to "anon";

grant select on table "public"."agent_trip_ledger" to "anon";

grant trigger on table "public"."agent_trip_ledger" to "anon";

grant truncate on table "public"."agent_trip_ledger" to "anon";

grant update on table "public"."agent_trip_ledger" to "anon";

grant delete on table "public"."agent_trip_ledger" to "authenticated";

grant insert on table "public"."agent_trip_ledger" to "authenticated";

grant references on table "public"."agent_trip_ledger" to "authenticated";

grant select on table "public"."agent_trip_ledger" to "authenticated";

grant trigger on table "public"."agent_trip_ledger" to "authenticated";

grant truncate on table "public"."agent_trip_ledger" to "authenticated";

grant update on table "public"."agent_trip_ledger" to "authenticated";

grant delete on table "public"."agent_trip_ledger" to "service_role";

grant insert on table "public"."agent_trip_ledger" to "service_role";

grant references on table "public"."agent_trip_ledger" to "service_role";

grant select on table "public"."agent_trip_ledger" to "service_role";

grant trigger on table "public"."agent_trip_ledger" to "service_role";

grant truncate on table "public"."agent_trip_ledger" to "service_role";

grant update on table "public"."agent_trip_ledger" to "service_role";

grant delete on table "public"."agent_withdraw_requests" to "anon";

grant insert on table "public"."agent_withdraw_requests" to "anon";

grant references on table "public"."agent_withdraw_requests" to "anon";

grant select on table "public"."agent_withdraw_requests" to "anon";

grant trigger on table "public"."agent_withdraw_requests" to "anon";

grant truncate on table "public"."agent_withdraw_requests" to "anon";

grant update on table "public"."agent_withdraw_requests" to "anon";

grant delete on table "public"."agent_withdraw_requests" to "authenticated";

grant insert on table "public"."agent_withdraw_requests" to "authenticated";

grant references on table "public"."agent_withdraw_requests" to "authenticated";

grant select on table "public"."agent_withdraw_requests" to "authenticated";

grant trigger on table "public"."agent_withdraw_requests" to "authenticated";

grant truncate on table "public"."agent_withdraw_requests" to "authenticated";

grant update on table "public"."agent_withdraw_requests" to "authenticated";

grant delete on table "public"."agent_withdraw_requests" to "service_role";

grant insert on table "public"."agent_withdraw_requests" to "service_role";

grant references on table "public"."agent_withdraw_requests" to "service_role";

grant select on table "public"."agent_withdraw_requests" to "service_role";

grant trigger on table "public"."agent_withdraw_requests" to "service_role";

grant truncate on table "public"."agent_withdraw_requests" to "service_role";

grant update on table "public"."agent_withdraw_requests" to "service_role";

grant delete on table "public"."agents" to "anon";

grant insert on table "public"."agents" to "anon";

grant references on table "public"."agents" to "anon";

grant select on table "public"."agents" to "anon";

grant trigger on table "public"."agents" to "anon";

grant truncate on table "public"."agents" to "anon";

grant update on table "public"."agents" to "anon";

grant delete on table "public"."agents" to "authenticated";

grant insert on table "public"."agents" to "authenticated";

grant references on table "public"."agents" to "authenticated";

grant select on table "public"."agents" to "authenticated";

grant trigger on table "public"."agents" to "authenticated";

grant truncate on table "public"."agents" to "authenticated";

grant update on table "public"."agents" to "authenticated";

grant delete on table "public"."agents" to "service_role";

grant insert on table "public"."agents" to "service_role";

grant references on table "public"."agents" to "service_role";

grant select on table "public"."agents" to "service_role";

grant trigger on table "public"."agents" to "service_role";

grant truncate on table "public"."agents" to "service_role";

grant update on table "public"."agents" to "service_role";

grant delete on table "public"."audit_logs" to "anon";

grant insert on table "public"."audit_logs" to "anon";

grant references on table "public"."audit_logs" to "anon";

grant select on table "public"."audit_logs" to "anon";

grant trigger on table "public"."audit_logs" to "anon";

grant truncate on table "public"."audit_logs" to "anon";

grant update on table "public"."audit_logs" to "anon";

grant delete on table "public"."audit_logs" to "authenticated";

grant insert on table "public"."audit_logs" to "authenticated";

grant references on table "public"."audit_logs" to "authenticated";

grant select on table "public"."audit_logs" to "authenticated";

grant trigger on table "public"."audit_logs" to "authenticated";

grant truncate on table "public"."audit_logs" to "authenticated";

grant update on table "public"."audit_logs" to "authenticated";

grant delete on table "public"."audit_logs" to "service_role";

grant insert on table "public"."audit_logs" to "service_role";

grant references on table "public"."audit_logs" to "service_role";

grant select on table "public"."audit_logs" to "service_role";

grant trigger on table "public"."audit_logs" to "service_role";

grant truncate on table "public"."audit_logs" to "service_role";

grant update on table "public"."audit_logs" to "service_role";

grant delete on table "public"."audit_trail" to "anon";

grant insert on table "public"."audit_trail" to "anon";

grant references on table "public"."audit_trail" to "anon";

grant select on table "public"."audit_trail" to "anon";

grant trigger on table "public"."audit_trail" to "anon";

grant truncate on table "public"."audit_trail" to "anon";

grant update on table "public"."audit_trail" to "anon";

grant delete on table "public"."audit_trail" to "authenticated";

grant insert on table "public"."audit_trail" to "authenticated";

grant references on table "public"."audit_trail" to "authenticated";

grant select on table "public"."audit_trail" to "authenticated";

grant trigger on table "public"."audit_trail" to "authenticated";

grant truncate on table "public"."audit_trail" to "authenticated";

grant update on table "public"."audit_trail" to "authenticated";

grant delete on table "public"."audit_trail" to "service_role";

grant insert on table "public"."audit_trail" to "service_role";

grant references on table "public"."audit_trail" to "service_role";

grant select on table "public"."audit_trail" to "service_role";

grant trigger on table "public"."audit_trail" to "service_role";

grant truncate on table "public"."audit_trail" to "service_role";

grant update on table "public"."audit_trail" to "service_role";

grant delete on table "public"."client_invoices" to "anon";

grant insert on table "public"."client_invoices" to "anon";

grant references on table "public"."client_invoices" to "anon";

grant select on table "public"."client_invoices" to "anon";

grant trigger on table "public"."client_invoices" to "anon";

grant truncate on table "public"."client_invoices" to "anon";

grant update on table "public"."client_invoices" to "anon";

grant delete on table "public"."client_invoices" to "authenticated";

grant insert on table "public"."client_invoices" to "authenticated";

grant references on table "public"."client_invoices" to "authenticated";

grant select on table "public"."client_invoices" to "authenticated";

grant trigger on table "public"."client_invoices" to "authenticated";

grant truncate on table "public"."client_invoices" to "authenticated";

grant update on table "public"."client_invoices" to "authenticated";

grant delete on table "public"."client_invoices" to "service_role";

grant insert on table "public"."client_invoices" to "service_role";

grant references on table "public"."client_invoices" to "service_role";

grant select on table "public"."client_invoices" to "service_role";

grant trigger on table "public"."client_invoices" to "service_role";

grant truncate on table "public"."client_invoices" to "service_role";

grant update on table "public"."client_invoices" to "service_role";

grant delete on table "public"."client_invoices_gst" to "anon";

grant insert on table "public"."client_invoices_gst" to "anon";

grant references on table "public"."client_invoices_gst" to "anon";

grant select on table "public"."client_invoices_gst" to "anon";

grant trigger on table "public"."client_invoices_gst" to "anon";

grant truncate on table "public"."client_invoices_gst" to "anon";

grant update on table "public"."client_invoices_gst" to "anon";

grant delete on table "public"."client_invoices_gst" to "authenticated";

grant insert on table "public"."client_invoices_gst" to "authenticated";

grant references on table "public"."client_invoices_gst" to "authenticated";

grant select on table "public"."client_invoices_gst" to "authenticated";

grant trigger on table "public"."client_invoices_gst" to "authenticated";

grant truncate on table "public"."client_invoices_gst" to "authenticated";

grant update on table "public"."client_invoices_gst" to "authenticated";

grant delete on table "public"."client_invoices_gst" to "service_role";

grant insert on table "public"."client_invoices_gst" to "service_role";

grant references on table "public"."client_invoices_gst" to "service_role";

grant select on table "public"."client_invoices_gst" to "service_role";

grant trigger on table "public"."client_invoices_gst" to "service_role";

grant truncate on table "public"."client_invoices_gst" to "service_role";

grant update on table "public"."client_invoices_gst" to "service_role";

grant delete on table "public"."client_payments" to "anon";

grant insert on table "public"."client_payments" to "anon";

grant references on table "public"."client_payments" to "anon";

grant select on table "public"."client_payments" to "anon";

grant trigger on table "public"."client_payments" to "anon";

grant truncate on table "public"."client_payments" to "anon";

grant update on table "public"."client_payments" to "anon";

grant delete on table "public"."client_payments" to "authenticated";

grant insert on table "public"."client_payments" to "authenticated";

grant references on table "public"."client_payments" to "authenticated";

grant select on table "public"."client_payments" to "authenticated";

grant trigger on table "public"."client_payments" to "authenticated";

grant truncate on table "public"."client_payments" to "authenticated";

grant update on table "public"."client_payments" to "authenticated";

grant delete on table "public"."client_payments" to "service_role";

grant insert on table "public"."client_payments" to "service_role";

grant references on table "public"."client_payments" to "service_role";

grant select on table "public"."client_payments" to "service_role";

grant trigger on table "public"."client_payments" to "service_role";

grant truncate on table "public"."client_payments" to "service_role";

grant update on table "public"."client_payments" to "service_role";

grant delete on table "public"."clients" to "anon";

grant insert on table "public"."clients" to "anon";

grant references on table "public"."clients" to "anon";

grant select on table "public"."clients" to "anon";

grant trigger on table "public"."clients" to "anon";

grant truncate on table "public"."clients" to "anon";

grant update on table "public"."clients" to "anon";

grant delete on table "public"."clients" to "authenticated";

grant insert on table "public"."clients" to "authenticated";

grant references on table "public"."clients" to "authenticated";

grant select on table "public"."clients" to "authenticated";

grant trigger on table "public"."clients" to "authenticated";

grant truncate on table "public"."clients" to "authenticated";

grant update on table "public"."clients" to "authenticated";

grant delete on table "public"."clients" to "service_role";

grant insert on table "public"."clients" to "service_role";

grant references on table "public"."clients" to "service_role";

grant select on table "public"."clients" to "service_role";

grant trigger on table "public"."clients" to "service_role";

grant truncate on table "public"."clients" to "service_role";

grant update on table "public"."clients" to "service_role";

grant delete on table "public"."commodities" to "anon";

grant insert on table "public"."commodities" to "anon";

grant references on table "public"."commodities" to "anon";

grant select on table "public"."commodities" to "anon";

grant trigger on table "public"."commodities" to "anon";

grant truncate on table "public"."commodities" to "anon";

grant update on table "public"."commodities" to "anon";

grant delete on table "public"."commodities" to "authenticated";

grant insert on table "public"."commodities" to "authenticated";

grant references on table "public"."commodities" to "authenticated";

grant select on table "public"."commodities" to "authenticated";

grant trigger on table "public"."commodities" to "authenticated";

grant truncate on table "public"."commodities" to "authenticated";

grant update on table "public"."commodities" to "authenticated";

grant delete on table "public"."commodities" to "service_role";

grant insert on table "public"."commodities" to "service_role";

grant references on table "public"."commodities" to "service_role";

grant select on table "public"."commodities" to "service_role";

grant trigger on table "public"."commodities" to "service_role";

grant truncate on table "public"."commodities" to "service_role";

grant update on table "public"."commodities" to "service_role";

grant delete on table "public"."company_ledger" to "anon";

grant insert on table "public"."company_ledger" to "anon";

grant references on table "public"."company_ledger" to "anon";

grant select on table "public"."company_ledger" to "anon";

grant trigger on table "public"."company_ledger" to "anon";

grant truncate on table "public"."company_ledger" to "anon";

grant update on table "public"."company_ledger" to "anon";

grant delete on table "public"."company_ledger" to "authenticated";

grant insert on table "public"."company_ledger" to "authenticated";

grant references on table "public"."company_ledger" to "authenticated";

grant select on table "public"."company_ledger" to "authenticated";

grant trigger on table "public"."company_ledger" to "authenticated";

grant truncate on table "public"."company_ledger" to "authenticated";

grant update on table "public"."company_ledger" to "authenticated";

grant delete on table "public"."company_ledger" to "service_role";

grant insert on table "public"."company_ledger" to "service_role";

grant references on table "public"."company_ledger" to "service_role";

grant select on table "public"."company_ledger" to "service_role";

grant trigger on table "public"."company_ledger" to "service_role";

grant truncate on table "public"."company_ledger" to "service_role";

grant update on table "public"."company_ledger" to "service_role";

grant delete on table "public"."credentials" to "anon";

grant insert on table "public"."credentials" to "anon";

grant references on table "public"."credentials" to "anon";

grant select on table "public"."credentials" to "anon";

grant trigger on table "public"."credentials" to "anon";

grant truncate on table "public"."credentials" to "anon";

grant update on table "public"."credentials" to "anon";

grant delete on table "public"."credentials" to "authenticated";

grant insert on table "public"."credentials" to "authenticated";

grant references on table "public"."credentials" to "authenticated";

grant select on table "public"."credentials" to "authenticated";

grant trigger on table "public"."credentials" to "authenticated";

grant truncate on table "public"."credentials" to "authenticated";

grant update on table "public"."credentials" to "authenticated";

grant delete on table "public"."credentials" to "service_role";

grant insert on table "public"."credentials" to "service_role";

grant references on table "public"."credentials" to "service_role";

grant select on table "public"."credentials" to "service_role";

grant trigger on table "public"."credentials" to "service_role";

grant truncate on table "public"."credentials" to "service_role";

grant update on table "public"."credentials" to "service_role";

grant delete on table "public"."expenses" to "anon";

grant insert on table "public"."expenses" to "anon";

grant references on table "public"."expenses" to "anon";

grant select on table "public"."expenses" to "anon";

grant trigger on table "public"."expenses" to "anon";

grant truncate on table "public"."expenses" to "anon";

grant update on table "public"."expenses" to "anon";

grant delete on table "public"."expenses" to "authenticated";

grant insert on table "public"."expenses" to "authenticated";

grant references on table "public"."expenses" to "authenticated";

grant select on table "public"."expenses" to "authenticated";

grant trigger on table "public"."expenses" to "authenticated";

grant truncate on table "public"."expenses" to "authenticated";

grant update on table "public"."expenses" to "authenticated";

grant delete on table "public"."expenses" to "service_role";

grant insert on table "public"."expenses" to "service_role";

grant references on table "public"."expenses" to "service_role";

grant select on table "public"."expenses" to "service_role";

grant trigger on table "public"."expenses" to "service_role";

grant truncate on table "public"."expenses" to "service_role";

grant update on table "public"."expenses" to "service_role";

grant delete on table "public"."gst_credit_notes" to "anon";

grant insert on table "public"."gst_credit_notes" to "anon";

grant references on table "public"."gst_credit_notes" to "anon";

grant select on table "public"."gst_credit_notes" to "anon";

grant trigger on table "public"."gst_credit_notes" to "anon";

grant truncate on table "public"."gst_credit_notes" to "anon";

grant update on table "public"."gst_credit_notes" to "anon";

grant delete on table "public"."gst_credit_notes" to "authenticated";

grant insert on table "public"."gst_credit_notes" to "authenticated";

grant references on table "public"."gst_credit_notes" to "authenticated";

grant select on table "public"."gst_credit_notes" to "authenticated";

grant trigger on table "public"."gst_credit_notes" to "authenticated";

grant truncate on table "public"."gst_credit_notes" to "authenticated";

grant update on table "public"."gst_credit_notes" to "authenticated";

grant delete on table "public"."gst_credit_notes" to "service_role";

grant insert on table "public"."gst_credit_notes" to "service_role";

grant references on table "public"."gst_credit_notes" to "service_role";

grant select on table "public"."gst_credit_notes" to "service_role";

grant trigger on table "public"."gst_credit_notes" to "service_role";

grant truncate on table "public"."gst_credit_notes" to "service_role";

grant update on table "public"."gst_credit_notes" to "service_role";

grant delete on table "public"."gst_payments" to "anon";

grant insert on table "public"."gst_payments" to "anon";

grant references on table "public"."gst_payments" to "anon";

grant select on table "public"."gst_payments" to "anon";

grant trigger on table "public"."gst_payments" to "anon";

grant truncate on table "public"."gst_payments" to "anon";

grant update on table "public"."gst_payments" to "anon";

grant delete on table "public"."gst_payments" to "authenticated";

grant insert on table "public"."gst_payments" to "authenticated";

grant references on table "public"."gst_payments" to "authenticated";

grant select on table "public"."gst_payments" to "authenticated";

grant trigger on table "public"."gst_payments" to "authenticated";

grant truncate on table "public"."gst_payments" to "authenticated";

grant update on table "public"."gst_payments" to "authenticated";

grant delete on table "public"."gst_payments" to "service_role";

grant insert on table "public"."gst_payments" to "service_role";

grant references on table "public"."gst_payments" to "service_role";

grant select on table "public"."gst_payments" to "service_role";

grant trigger on table "public"."gst_payments" to "service_role";

grant truncate on table "public"."gst_payments" to "service_role";

grant update on table "public"."gst_payments" to "service_role";

grant delete on table "public"."interior_projects" to "anon";

grant insert on table "public"."interior_projects" to "anon";

grant references on table "public"."interior_projects" to "anon";

grant select on table "public"."interior_projects" to "anon";

grant trigger on table "public"."interior_projects" to "anon";

grant truncate on table "public"."interior_projects" to "anon";

grant update on table "public"."interior_projects" to "anon";

grant delete on table "public"."interior_projects" to "authenticated";

grant insert on table "public"."interior_projects" to "authenticated";

grant references on table "public"."interior_projects" to "authenticated";

grant select on table "public"."interior_projects" to "authenticated";

grant trigger on table "public"."interior_projects" to "authenticated";

grant truncate on table "public"."interior_projects" to "authenticated";

grant update on table "public"."interior_projects" to "authenticated";

grant delete on table "public"."interior_projects" to "service_role";

grant insert on table "public"."interior_projects" to "service_role";

grant references on table "public"."interior_projects" to "service_role";

grant select on table "public"."interior_projects" to "service_role";

grant trigger on table "public"."interior_projects" to "service_role";

grant truncate on table "public"."interior_projects" to "service_role";

grant update on table "public"."interior_projects" to "service_role";

grant delete on table "public"."inventory_items" to "anon";

grant insert on table "public"."inventory_items" to "anon";

grant references on table "public"."inventory_items" to "anon";

grant select on table "public"."inventory_items" to "anon";

grant trigger on table "public"."inventory_items" to "anon";

grant truncate on table "public"."inventory_items" to "anon";

grant update on table "public"."inventory_items" to "anon";

grant delete on table "public"."inventory_items" to "authenticated";

grant insert on table "public"."inventory_items" to "authenticated";

grant references on table "public"."inventory_items" to "authenticated";

grant select on table "public"."inventory_items" to "authenticated";

grant trigger on table "public"."inventory_items" to "authenticated";

grant truncate on table "public"."inventory_items" to "authenticated";

grant update on table "public"."inventory_items" to "authenticated";

grant delete on table "public"."inventory_items" to "service_role";

grant insert on table "public"."inventory_items" to "service_role";

grant references on table "public"."inventory_items" to "service_role";

grant select on table "public"."inventory_items" to "service_role";

grant trigger on table "public"."inventory_items" to "service_role";

grant truncate on table "public"."inventory_items" to "service_role";

grant update on table "public"."inventory_items" to "service_role";

grant delete on table "public"."invoice_trip_breakdown" to "anon";

grant insert on table "public"."invoice_trip_breakdown" to "anon";

grant references on table "public"."invoice_trip_breakdown" to "anon";

grant select on table "public"."invoice_trip_breakdown" to "anon";

grant trigger on table "public"."invoice_trip_breakdown" to "anon";

grant truncate on table "public"."invoice_trip_breakdown" to "anon";

grant update on table "public"."invoice_trip_breakdown" to "anon";

grant delete on table "public"."invoice_trip_breakdown" to "authenticated";

grant insert on table "public"."invoice_trip_breakdown" to "authenticated";

grant references on table "public"."invoice_trip_breakdown" to "authenticated";

grant select on table "public"."invoice_trip_breakdown" to "authenticated";

grant trigger on table "public"."invoice_trip_breakdown" to "authenticated";

grant truncate on table "public"."invoice_trip_breakdown" to "authenticated";

grant update on table "public"."invoice_trip_breakdown" to "authenticated";

grant delete on table "public"."invoice_trip_breakdown" to "service_role";

grant insert on table "public"."invoice_trip_breakdown" to "service_role";

grant references on table "public"."invoice_trip_breakdown" to "service_role";

grant select on table "public"."invoice_trip_breakdown" to "service_role";

grant trigger on table "public"."invoice_trip_breakdown" to "service_role";

grant truncate on table "public"."invoice_trip_breakdown" to "service_role";

grant update on table "public"."invoice_trip_breakdown" to "service_role";

grant delete on table "public"."invoice_trip_breakdown_gst" to "anon";

grant insert on table "public"."invoice_trip_breakdown_gst" to "anon";

grant references on table "public"."invoice_trip_breakdown_gst" to "anon";

grant select on table "public"."invoice_trip_breakdown_gst" to "anon";

grant trigger on table "public"."invoice_trip_breakdown_gst" to "anon";

grant truncate on table "public"."invoice_trip_breakdown_gst" to "anon";

grant update on table "public"."invoice_trip_breakdown_gst" to "anon";

grant delete on table "public"."invoice_trip_breakdown_gst" to "authenticated";

grant insert on table "public"."invoice_trip_breakdown_gst" to "authenticated";

grant references on table "public"."invoice_trip_breakdown_gst" to "authenticated";

grant select on table "public"."invoice_trip_breakdown_gst" to "authenticated";

grant trigger on table "public"."invoice_trip_breakdown_gst" to "authenticated";

grant truncate on table "public"."invoice_trip_breakdown_gst" to "authenticated";

grant update on table "public"."invoice_trip_breakdown_gst" to "authenticated";

grant delete on table "public"."invoice_trip_breakdown_gst" to "service_role";

grant insert on table "public"."invoice_trip_breakdown_gst" to "service_role";

grant references on table "public"."invoice_trip_breakdown_gst" to "service_role";

grant select on table "public"."invoice_trip_breakdown_gst" to "service_role";

grant trigger on table "public"."invoice_trip_breakdown_gst" to "service_role";

grant truncate on table "public"."invoice_trip_breakdown_gst" to "service_role";

grant update on table "public"."invoice_trip_breakdown_gst" to "service_role";

grant delete on table "public"."ledger_entries" to "anon";

grant insert on table "public"."ledger_entries" to "anon";

grant references on table "public"."ledger_entries" to "anon";

grant select on table "public"."ledger_entries" to "anon";

grant trigger on table "public"."ledger_entries" to "anon";

grant truncate on table "public"."ledger_entries" to "anon";

grant update on table "public"."ledger_entries" to "anon";

grant delete on table "public"."ledger_entries" to "authenticated";

grant insert on table "public"."ledger_entries" to "authenticated";

grant references on table "public"."ledger_entries" to "authenticated";

grant select on table "public"."ledger_entries" to "authenticated";

grant trigger on table "public"."ledger_entries" to "authenticated";

grant truncate on table "public"."ledger_entries" to "authenticated";

grant update on table "public"."ledger_entries" to "authenticated";

grant delete on table "public"."ledger_entries" to "service_role";

grant insert on table "public"."ledger_entries" to "service_role";

grant references on table "public"."ledger_entries" to "service_role";

grant select on table "public"."ledger_entries" to "service_role";

grant trigger on table "public"."ledger_entries" to "service_role";

grant truncate on table "public"."ledger_entries" to "service_role";

grant update on table "public"."ledger_entries" to "service_role";

grant delete on table "public"."meetings" to "anon";

grant insert on table "public"."meetings" to "anon";

grant references on table "public"."meetings" to "anon";

grant select on table "public"."meetings" to "anon";

grant trigger on table "public"."meetings" to "anon";

grant truncate on table "public"."meetings" to "anon";

grant update on table "public"."meetings" to "anon";

grant delete on table "public"."meetings" to "authenticated";

grant insert on table "public"."meetings" to "authenticated";

grant references on table "public"."meetings" to "authenticated";

grant select on table "public"."meetings" to "authenticated";

grant trigger on table "public"."meetings" to "authenticated";

grant truncate on table "public"."meetings" to "authenticated";

grant update on table "public"."meetings" to "authenticated";

grant delete on table "public"."meetings" to "service_role";

grant insert on table "public"."meetings" to "service_role";

grant references on table "public"."meetings" to "service_role";

grant select on table "public"."meetings" to "service_role";

grant trigger on table "public"."meetings" to "service_role";

grant truncate on table "public"."meetings" to "service_role";

grant update on table "public"."meetings" to "service_role";

grant delete on table "public"."otp_logins" to "service_role";

grant insert on table "public"."otp_logins" to "service_role";

grant references on table "public"."otp_logins" to "service_role";

grant select on table "public"."otp_logins" to "service_role";

grant trigger on table "public"."otp_logins" to "service_role";

grant truncate on table "public"."otp_logins" to "service_role";

grant update on table "public"."otp_logins" to "service_role";

grant delete on table "public"."permissions" to "anon";

grant insert on table "public"."permissions" to "anon";

grant references on table "public"."permissions" to "anon";

grant select on table "public"."permissions" to "anon";

grant trigger on table "public"."permissions" to "anon";

grant truncate on table "public"."permissions" to "anon";

grant update on table "public"."permissions" to "anon";

grant delete on table "public"."permissions" to "authenticated";

grant insert on table "public"."permissions" to "authenticated";

grant references on table "public"."permissions" to "authenticated";

grant select on table "public"."permissions" to "authenticated";

grant trigger on table "public"."permissions" to "authenticated";

grant truncate on table "public"."permissions" to "authenticated";

grant update on table "public"."permissions" to "authenticated";

grant delete on table "public"."permissions" to "service_role";

grant insert on table "public"."permissions" to "service_role";

grant references on table "public"."permissions" to "service_role";

grant select on table "public"."permissions" to "service_role";

grant trigger on table "public"."permissions" to "service_role";

grant truncate on table "public"."permissions" to "service_role";

grant update on table "public"."permissions" to "service_role";

grant delete on table "public"."project_expenses" to "anon";

grant insert on table "public"."project_expenses" to "anon";

grant references on table "public"."project_expenses" to "anon";

grant select on table "public"."project_expenses" to "anon";

grant trigger on table "public"."project_expenses" to "anon";

grant truncate on table "public"."project_expenses" to "anon";

grant update on table "public"."project_expenses" to "anon";

grant delete on table "public"."project_expenses" to "authenticated";

grant insert on table "public"."project_expenses" to "authenticated";

grant references on table "public"."project_expenses" to "authenticated";

grant select on table "public"."project_expenses" to "authenticated";

grant trigger on table "public"."project_expenses" to "authenticated";

grant truncate on table "public"."project_expenses" to "authenticated";

grant update on table "public"."project_expenses" to "authenticated";

grant delete on table "public"."project_expenses" to "service_role";

grant insert on table "public"."project_expenses" to "service_role";

grant references on table "public"."project_expenses" to "service_role";

grant select on table "public"."project_expenses" to "service_role";

grant trigger on table "public"."project_expenses" to "service_role";

grant truncate on table "public"."project_expenses" to "service_role";

grant update on table "public"."project_expenses" to "service_role";

grant delete on table "public"."project_inventory" to "anon";

grant insert on table "public"."project_inventory" to "anon";

grant references on table "public"."project_inventory" to "anon";

grant select on table "public"."project_inventory" to "anon";

grant trigger on table "public"."project_inventory" to "anon";

grant truncate on table "public"."project_inventory" to "anon";

grant update on table "public"."project_inventory" to "anon";

grant delete on table "public"."project_inventory" to "authenticated";

grant insert on table "public"."project_inventory" to "authenticated";

grant references on table "public"."project_inventory" to "authenticated";

grant select on table "public"."project_inventory" to "authenticated";

grant trigger on table "public"."project_inventory" to "authenticated";

grant truncate on table "public"."project_inventory" to "authenticated";

grant update on table "public"."project_inventory" to "authenticated";

grant delete on table "public"."project_inventory" to "service_role";

grant insert on table "public"."project_inventory" to "service_role";

grant references on table "public"."project_inventory" to "service_role";

grant select on table "public"."project_inventory" to "service_role";

grant trigger on table "public"."project_inventory" to "service_role";

grant truncate on table "public"."project_inventory" to "service_role";

grant update on table "public"."project_inventory" to "service_role";

grant delete on table "public"."project_site_photos" to "anon";

grant insert on table "public"."project_site_photos" to "anon";

grant references on table "public"."project_site_photos" to "anon";

grant select on table "public"."project_site_photos" to "anon";

grant trigger on table "public"."project_site_photos" to "anon";

grant truncate on table "public"."project_site_photos" to "anon";

grant update on table "public"."project_site_photos" to "anon";

grant delete on table "public"."project_site_photos" to "authenticated";

grant insert on table "public"."project_site_photos" to "authenticated";

grant references on table "public"."project_site_photos" to "authenticated";

grant select on table "public"."project_site_photos" to "authenticated";

grant trigger on table "public"."project_site_photos" to "authenticated";

grant truncate on table "public"."project_site_photos" to "authenticated";

grant update on table "public"."project_site_photos" to "authenticated";

grant delete on table "public"."project_site_photos" to "service_role";

grant insert on table "public"."project_site_photos" to "service_role";

grant references on table "public"."project_site_photos" to "service_role";

grant select on table "public"."project_site_photos" to "service_role";

grant trigger on table "public"."project_site_photos" to "service_role";

grant truncate on table "public"."project_site_photos" to "service_role";

grant update on table "public"."project_site_photos" to "service_role";

grant delete on table "public"."project_tasks" to "anon";

grant insert on table "public"."project_tasks" to "anon";

grant references on table "public"."project_tasks" to "anon";

grant select on table "public"."project_tasks" to "anon";

grant trigger on table "public"."project_tasks" to "anon";

grant truncate on table "public"."project_tasks" to "anon";

grant update on table "public"."project_tasks" to "anon";

grant delete on table "public"."project_tasks" to "authenticated";

grant insert on table "public"."project_tasks" to "authenticated";

grant references on table "public"."project_tasks" to "authenticated";

grant select on table "public"."project_tasks" to "authenticated";

grant trigger on table "public"."project_tasks" to "authenticated";

grant truncate on table "public"."project_tasks" to "authenticated";

grant update on table "public"."project_tasks" to "authenticated";

grant delete on table "public"."project_tasks" to "service_role";

grant insert on table "public"."project_tasks" to "service_role";

grant references on table "public"."project_tasks" to "service_role";

grant select on table "public"."project_tasks" to "service_role";

grant trigger on table "public"."project_tasks" to "service_role";

grant truncate on table "public"."project_tasks" to "service_role";

grant update on table "public"."project_tasks" to "service_role";

grant delete on table "public"."rates" to "anon";

grant insert on table "public"."rates" to "anon";

grant references on table "public"."rates" to "anon";

grant select on table "public"."rates" to "anon";

grant trigger on table "public"."rates" to "anon";

grant truncate on table "public"."rates" to "anon";

grant update on table "public"."rates" to "anon";

grant delete on table "public"."rates" to "authenticated";

grant insert on table "public"."rates" to "authenticated";

grant references on table "public"."rates" to "authenticated";

grant select on table "public"."rates" to "authenticated";

grant trigger on table "public"."rates" to "authenticated";

grant truncate on table "public"."rates" to "authenticated";

grant update on table "public"."rates" to "authenticated";

grant delete on table "public"."rates" to "service_role";

grant insert on table "public"."rates" to "service_role";

grant references on table "public"."rates" to "service_role";

grant select on table "public"."rates" to "service_role";

grant trigger on table "public"."rates" to "service_role";

grant truncate on table "public"."rates" to "service_role";

grant update on table "public"."rates" to "service_role";

grant delete on table "public"."role_permissions" to "anon";

grant insert on table "public"."role_permissions" to "anon";

grant references on table "public"."role_permissions" to "anon";

grant select on table "public"."role_permissions" to "anon";

grant trigger on table "public"."role_permissions" to "anon";

grant truncate on table "public"."role_permissions" to "anon";

grant update on table "public"."role_permissions" to "anon";

grant delete on table "public"."role_permissions" to "authenticated";

grant insert on table "public"."role_permissions" to "authenticated";

grant references on table "public"."role_permissions" to "authenticated";

grant select on table "public"."role_permissions" to "authenticated";

grant trigger on table "public"."role_permissions" to "authenticated";

grant truncate on table "public"."role_permissions" to "authenticated";

grant update on table "public"."role_permissions" to "authenticated";

grant delete on table "public"."role_permissions" to "service_role";

grant insert on table "public"."role_permissions" to "service_role";

grant references on table "public"."role_permissions" to "service_role";

grant select on table "public"."role_permissions" to "service_role";

grant trigger on table "public"."role_permissions" to "service_role";

grant truncate on table "public"."role_permissions" to "service_role";

grant update on table "public"."role_permissions" to "service_role";

grant delete on table "public"."role_routes" to "anon";

grant insert on table "public"."role_routes" to "anon";

grant references on table "public"."role_routes" to "anon";

grant select on table "public"."role_routes" to "anon";

grant trigger on table "public"."role_routes" to "anon";

grant truncate on table "public"."role_routes" to "anon";

grant update on table "public"."role_routes" to "anon";

grant delete on table "public"."role_routes" to "authenticated";

grant insert on table "public"."role_routes" to "authenticated";

grant references on table "public"."role_routes" to "authenticated";

grant select on table "public"."role_routes" to "authenticated";

grant trigger on table "public"."role_routes" to "authenticated";

grant truncate on table "public"."role_routes" to "authenticated";

grant update on table "public"."role_routes" to "authenticated";

grant delete on table "public"."role_routes" to "service_role";

grant insert on table "public"."role_routes" to "service_role";

grant references on table "public"."role_routes" to "service_role";

grant select on table "public"."role_routes" to "service_role";

grant trigger on table "public"."role_routes" to "service_role";

grant truncate on table "public"."role_routes" to "service_role";

grant update on table "public"."role_routes" to "service_role";

grant delete on table "public"."roles" to "anon";

grant insert on table "public"."roles" to "anon";

grant references on table "public"."roles" to "anon";

grant select on table "public"."roles" to "anon";

grant trigger on table "public"."roles" to "anon";

grant truncate on table "public"."roles" to "anon";

grant update on table "public"."roles" to "anon";

grant delete on table "public"."roles" to "authenticated";

grant insert on table "public"."roles" to "authenticated";

grant references on table "public"."roles" to "authenticated";

grant select on table "public"."roles" to "authenticated";

grant trigger on table "public"."roles" to "authenticated";

grant truncate on table "public"."roles" to "authenticated";

grant update on table "public"."roles" to "authenticated";

grant delete on table "public"."roles" to "service_role";

grant insert on table "public"."roles" to "service_role";

grant references on table "public"."roles" to "service_role";

grant select on table "public"."roles" to "service_role";

grant trigger on table "public"."roles" to "service_role";

grant truncate on table "public"."roles" to "service_role";

grant update on table "public"."roles" to "service_role";

grant delete on table "public"."routes" to "anon";

grant insert on table "public"."routes" to "anon";

grant references on table "public"."routes" to "anon";

grant select on table "public"."routes" to "anon";

grant trigger on table "public"."routes" to "anon";

grant truncate on table "public"."routes" to "anon";

grant update on table "public"."routes" to "anon";

grant delete on table "public"."routes" to "authenticated";

grant insert on table "public"."routes" to "authenticated";

grant references on table "public"."routes" to "authenticated";

grant select on table "public"."routes" to "authenticated";

grant trigger on table "public"."routes" to "authenticated";

grant truncate on table "public"."routes" to "authenticated";

grant update on table "public"."routes" to "authenticated";

grant delete on table "public"."routes" to "service_role";

grant insert on table "public"."routes" to "service_role";

grant references on table "public"."routes" to "service_role";

grant select on table "public"."routes" to "service_role";

grant trigger on table "public"."routes" to "service_role";

grant truncate on table "public"."routes" to "service_role";

grant update on table "public"."routes" to "service_role";

grant delete on table "public"."stock_movements" to "anon";

grant insert on table "public"."stock_movements" to "anon";

grant references on table "public"."stock_movements" to "anon";

grant select on table "public"."stock_movements" to "anon";

grant trigger on table "public"."stock_movements" to "anon";

grant truncate on table "public"."stock_movements" to "anon";

grant update on table "public"."stock_movements" to "anon";

grant delete on table "public"."stock_movements" to "authenticated";

grant insert on table "public"."stock_movements" to "authenticated";

grant references on table "public"."stock_movements" to "authenticated";

grant select on table "public"."stock_movements" to "authenticated";

grant trigger on table "public"."stock_movements" to "authenticated";

grant truncate on table "public"."stock_movements" to "authenticated";

grant update on table "public"."stock_movements" to "authenticated";

grant delete on table "public"."stock_movements" to "service_role";

grant insert on table "public"."stock_movements" to "service_role";

grant references on table "public"."stock_movements" to "service_role";

grant select on table "public"."stock_movements" to "service_role";

grant trigger on table "public"."stock_movements" to "service_role";

grant truncate on table "public"."stock_movements" to "service_role";

grant update on table "public"."stock_movements" to "service_role";

grant delete on table "public"."system_settings" to "anon";

grant insert on table "public"."system_settings" to "anon";

grant references on table "public"."system_settings" to "anon";

grant select on table "public"."system_settings" to "anon";

grant trigger on table "public"."system_settings" to "anon";

grant truncate on table "public"."system_settings" to "anon";

grant update on table "public"."system_settings" to "anon";

grant delete on table "public"."system_settings" to "authenticated";

grant insert on table "public"."system_settings" to "authenticated";

grant references on table "public"."system_settings" to "authenticated";

grant select on table "public"."system_settings" to "authenticated";

grant trigger on table "public"."system_settings" to "authenticated";

grant truncate on table "public"."system_settings" to "authenticated";

grant update on table "public"."system_settings" to "authenticated";

grant delete on table "public"."system_settings" to "service_role";

grant insert on table "public"."system_settings" to "service_role";

grant references on table "public"."system_settings" to "service_role";

grant select on table "public"."system_settings" to "service_role";

grant trigger on table "public"."system_settings" to "service_role";

grant truncate on table "public"."system_settings" to "service_role";

grant update on table "public"."system_settings" to "service_role";

grant delete on table "public"."transporter_adjustments" to "anon";

grant insert on table "public"."transporter_adjustments" to "anon";

grant references on table "public"."transporter_adjustments" to "anon";

grant select on table "public"."transporter_adjustments" to "anon";

grant trigger on table "public"."transporter_adjustments" to "anon";

grant truncate on table "public"."transporter_adjustments" to "anon";

grant update on table "public"."transporter_adjustments" to "anon";

grant delete on table "public"."transporter_adjustments" to "authenticated";

grant insert on table "public"."transporter_adjustments" to "authenticated";

grant references on table "public"."transporter_adjustments" to "authenticated";

grant select on table "public"."transporter_adjustments" to "authenticated";

grant trigger on table "public"."transporter_adjustments" to "authenticated";

grant truncate on table "public"."transporter_adjustments" to "authenticated";

grant update on table "public"."transporter_adjustments" to "authenticated";

grant delete on table "public"."transporter_adjustments" to "service_role";

grant insert on table "public"."transporter_adjustments" to "service_role";

grant references on table "public"."transporter_adjustments" to "service_role";

grant select on table "public"."transporter_adjustments" to "service_role";

grant trigger on table "public"."transporter_adjustments" to "service_role";

grant truncate on table "public"."transporter_adjustments" to "service_role";

grant update on table "public"."transporter_adjustments" to "service_role";

grant delete on table "public"."transporter_invoices" to "anon";

grant insert on table "public"."transporter_invoices" to "anon";

grant references on table "public"."transporter_invoices" to "anon";

grant select on table "public"."transporter_invoices" to "anon";

grant trigger on table "public"."transporter_invoices" to "anon";

grant truncate on table "public"."transporter_invoices" to "anon";

grant update on table "public"."transporter_invoices" to "anon";

grant delete on table "public"."transporter_invoices" to "authenticated";

grant insert on table "public"."transporter_invoices" to "authenticated";

grant references on table "public"."transporter_invoices" to "authenticated";

grant select on table "public"."transporter_invoices" to "authenticated";

grant trigger on table "public"."transporter_invoices" to "authenticated";

grant truncate on table "public"."transporter_invoices" to "authenticated";

grant update on table "public"."transporter_invoices" to "authenticated";

grant delete on table "public"."transporter_invoices" to "service_role";

grant insert on table "public"."transporter_invoices" to "service_role";

grant references on table "public"."transporter_invoices" to "service_role";

grant select on table "public"."transporter_invoices" to "service_role";

grant trigger on table "public"."transporter_invoices" to "service_role";

grant truncate on table "public"."transporter_invoices" to "service_role";

grant update on table "public"."transporter_invoices" to "service_role";

grant delete on table "public"."transporter_ledger" to "anon";

grant insert on table "public"."transporter_ledger" to "anon";

grant references on table "public"."transporter_ledger" to "anon";

grant select on table "public"."transporter_ledger" to "anon";

grant trigger on table "public"."transporter_ledger" to "anon";

grant truncate on table "public"."transporter_ledger" to "anon";

grant update on table "public"."transporter_ledger" to "anon";

grant delete on table "public"."transporter_ledger" to "authenticated";

grant insert on table "public"."transporter_ledger" to "authenticated";

grant references on table "public"."transporter_ledger" to "authenticated";

grant select on table "public"."transporter_ledger" to "authenticated";

grant trigger on table "public"."transporter_ledger" to "authenticated";

grant truncate on table "public"."transporter_ledger" to "authenticated";

grant update on table "public"."transporter_ledger" to "authenticated";

grant delete on table "public"."transporter_ledger" to "service_role";

grant insert on table "public"."transporter_ledger" to "service_role";

grant references on table "public"."transporter_ledger" to "service_role";

grant select on table "public"."transporter_ledger" to "service_role";

grant trigger on table "public"."transporter_ledger" to "service_role";

grant truncate on table "public"."transporter_ledger" to "service_role";

grant update on table "public"."transporter_ledger" to "service_role";

grant delete on table "public"."transporter_payments" to "anon";

grant insert on table "public"."transporter_payments" to "anon";

grant references on table "public"."transporter_payments" to "anon";

grant select on table "public"."transporter_payments" to "anon";

grant trigger on table "public"."transporter_payments" to "anon";

grant truncate on table "public"."transporter_payments" to "anon";

grant update on table "public"."transporter_payments" to "anon";

grant delete on table "public"."transporter_payments" to "authenticated";

grant insert on table "public"."transporter_payments" to "authenticated";

grant references on table "public"."transporter_payments" to "authenticated";

grant select on table "public"."transporter_payments" to "authenticated";

grant trigger on table "public"."transporter_payments" to "authenticated";

grant truncate on table "public"."transporter_payments" to "authenticated";

grant update on table "public"."transporter_payments" to "authenticated";

grant delete on table "public"."transporter_payments" to "service_role";

grant insert on table "public"."transporter_payments" to "service_role";

grant references on table "public"."transporter_payments" to "service_role";

grant select on table "public"."transporter_payments" to "service_role";

grant trigger on table "public"."transporter_payments" to "service_role";

grant truncate on table "public"."transporter_payments" to "service_role";

grant update on table "public"."transporter_payments" to "service_role";

grant delete on table "public"."transporters" to "anon";

grant insert on table "public"."transporters" to "anon";

grant references on table "public"."transporters" to "anon";

grant select on table "public"."transporters" to "anon";

grant trigger on table "public"."transporters" to "anon";

grant truncate on table "public"."transporters" to "anon";

grant update on table "public"."transporters" to "anon";

grant delete on table "public"."transporters" to "authenticated";

grant insert on table "public"."transporters" to "authenticated";

grant references on table "public"."transporters" to "authenticated";

grant select on table "public"."transporters" to "authenticated";

grant trigger on table "public"."transporters" to "authenticated";

grant truncate on table "public"."transporters" to "authenticated";

grant update on table "public"."transporters" to "authenticated";

grant delete on table "public"."transporters" to "service_role";

grant insert on table "public"."transporters" to "service_role";

grant references on table "public"."transporters" to "service_role";

grant select on table "public"."transporters" to "service_role";

grant trigger on table "public"."transporters" to "service_role";

grant truncate on table "public"."transporters" to "service_role";

grant update on table "public"."transporters" to "service_role";

grant delete on table "public"."trip_agents" to "anon";

grant insert on table "public"."trip_agents" to "anon";

grant references on table "public"."trip_agents" to "anon";

grant select on table "public"."trip_agents" to "anon";

grant trigger on table "public"."trip_agents" to "anon";

grant truncate on table "public"."trip_agents" to "anon";

grant update on table "public"."trip_agents" to "anon";

grant delete on table "public"."trip_agents" to "authenticated";

grant insert on table "public"."trip_agents" to "authenticated";

grant references on table "public"."trip_agents" to "authenticated";

grant select on table "public"."trip_agents" to "authenticated";

grant trigger on table "public"."trip_agents" to "authenticated";

grant truncate on table "public"."trip_agents" to "authenticated";

grant update on table "public"."trip_agents" to "authenticated";

grant delete on table "public"."trip_agents" to "service_role";

grant insert on table "public"."trip_agents" to "service_role";

grant references on table "public"."trip_agents" to "service_role";

grant select on table "public"."trip_agents" to "service_role";

grant trigger on table "public"."trip_agents" to "service_role";

grant truncate on table "public"."trip_agents" to "service_role";

grant update on table "public"."trip_agents" to "service_role";

grant delete on table "public"."trip_documents" to "anon";

grant insert on table "public"."trip_documents" to "anon";

grant references on table "public"."trip_documents" to "anon";

grant select on table "public"."trip_documents" to "anon";

grant trigger on table "public"."trip_documents" to "anon";

grant truncate on table "public"."trip_documents" to "anon";

grant update on table "public"."trip_documents" to "anon";

grant delete on table "public"."trip_documents" to "authenticated";

grant insert on table "public"."trip_documents" to "authenticated";

grant references on table "public"."trip_documents" to "authenticated";

grant select on table "public"."trip_documents" to "authenticated";

grant trigger on table "public"."trip_documents" to "authenticated";

grant truncate on table "public"."trip_documents" to "authenticated";

grant update on table "public"."trip_documents" to "authenticated";

grant delete on table "public"."trip_documents" to "service_role";

grant insert on table "public"."trip_documents" to "service_role";

grant references on table "public"."trip_documents" to "service_role";

grant select on table "public"."trip_documents" to "service_role";

grant trigger on table "public"."trip_documents" to "service_role";

grant truncate on table "public"."trip_documents" to "service_role";

grant update on table "public"."trip_documents" to "service_role";

grant delete on table "public"."trips" to "anon";

grant insert on table "public"."trips" to "anon";

grant references on table "public"."trips" to "anon";

grant select on table "public"."trips" to "anon";

grant trigger on table "public"."trips" to "anon";

grant truncate on table "public"."trips" to "anon";

grant update on table "public"."trips" to "anon";

grant delete on table "public"."trips" to "authenticated";

grant insert on table "public"."trips" to "authenticated";

grant references on table "public"."trips" to "authenticated";

grant select on table "public"."trips" to "authenticated";

grant trigger on table "public"."trips" to "authenticated";

grant truncate on table "public"."trips" to "authenticated";

grant update on table "public"."trips" to "authenticated";

grant delete on table "public"."trips" to "service_role";

grant insert on table "public"."trips" to "service_role";

grant references on table "public"."trips" to "service_role";

grant select on table "public"."trips" to "service_role";

grant trigger on table "public"."trips" to "service_role";

grant truncate on table "public"."trips" to "service_role";

grant update on table "public"."trips" to "service_role";

grant delete on table "public"."truck_agents" to "anon";

grant insert on table "public"."truck_agents" to "anon";

grant references on table "public"."truck_agents" to "anon";

grant select on table "public"."truck_agents" to "anon";

grant trigger on table "public"."truck_agents" to "anon";

grant truncate on table "public"."truck_agents" to "anon";

grant update on table "public"."truck_agents" to "anon";

grant delete on table "public"."truck_agents" to "authenticated";

grant insert on table "public"."truck_agents" to "authenticated";

grant references on table "public"."truck_agents" to "authenticated";

grant select on table "public"."truck_agents" to "authenticated";

grant trigger on table "public"."truck_agents" to "authenticated";

grant truncate on table "public"."truck_agents" to "authenticated";

grant update on table "public"."truck_agents" to "authenticated";

grant delete on table "public"."truck_agents" to "service_role";

grant insert on table "public"."truck_agents" to "service_role";

grant references on table "public"."truck_agents" to "service_role";

grant select on table "public"."truck_agents" to "service_role";

grant trigger on table "public"."truck_agents" to "service_role";

grant truncate on table "public"."truck_agents" to "service_role";

grant update on table "public"."truck_agents" to "service_role";

grant delete on table "public"."trucks" to "anon";

grant insert on table "public"."trucks" to "anon";

grant references on table "public"."trucks" to "anon";

grant select on table "public"."trucks" to "anon";

grant trigger on table "public"."trucks" to "anon";

grant truncate on table "public"."trucks" to "anon";

grant update on table "public"."trucks" to "anon";

grant delete on table "public"."trucks" to "authenticated";

grant insert on table "public"."trucks" to "authenticated";

grant references on table "public"."trucks" to "authenticated";

grant select on table "public"."trucks" to "authenticated";

grant trigger on table "public"."trucks" to "authenticated";

grant truncate on table "public"."trucks" to "authenticated";

grant update on table "public"."trucks" to "authenticated";

grant delete on table "public"."trucks" to "service_role";

grant insert on table "public"."trucks" to "service_role";

grant references on table "public"."trucks" to "service_role";

grant select on table "public"."trucks" to "service_role";

grant trigger on table "public"."trucks" to "service_role";

grant truncate on table "public"."trucks" to "service_role";

grant update on table "public"."trucks" to "service_role";

grant delete on table "public"."user_contacts" to "anon";

grant insert on table "public"."user_contacts" to "anon";

grant references on table "public"."user_contacts" to "anon";

grant select on table "public"."user_contacts" to "anon";

grant trigger on table "public"."user_contacts" to "anon";

grant truncate on table "public"."user_contacts" to "anon";

grant update on table "public"."user_contacts" to "anon";

grant delete on table "public"."user_contacts" to "authenticated";

grant insert on table "public"."user_contacts" to "authenticated";

grant references on table "public"."user_contacts" to "authenticated";

grant select on table "public"."user_contacts" to "authenticated";

grant trigger on table "public"."user_contacts" to "authenticated";

grant truncate on table "public"."user_contacts" to "authenticated";

grant update on table "public"."user_contacts" to "authenticated";

grant delete on table "public"."user_contacts" to "service_role";

grant insert on table "public"."user_contacts" to "service_role";

grant references on table "public"."user_contacts" to "service_role";

grant select on table "public"."user_contacts" to "service_role";

grant trigger on table "public"."user_contacts" to "service_role";

grant truncate on table "public"."user_contacts" to "service_role";

grant update on table "public"."user_contacts" to "service_role";

grant delete on table "public"."user_roles" to "anon";

grant insert on table "public"."user_roles" to "anon";

grant references on table "public"."user_roles" to "anon";

grant select on table "public"."user_roles" to "anon";

grant trigger on table "public"."user_roles" to "anon";

grant truncate on table "public"."user_roles" to "anon";

grant update on table "public"."user_roles" to "anon";

grant delete on table "public"."user_roles" to "authenticated";

grant insert on table "public"."user_roles" to "authenticated";

grant references on table "public"."user_roles" to "authenticated";

grant select on table "public"."user_roles" to "authenticated";

grant trigger on table "public"."user_roles" to "authenticated";

grant truncate on table "public"."user_roles" to "authenticated";

grant update on table "public"."user_roles" to "authenticated";

grant delete on table "public"."user_roles" to "service_role";

grant insert on table "public"."user_roles" to "service_role";

grant references on table "public"."user_roles" to "service_role";

grant select on table "public"."user_roles" to "service_role";

grant trigger on table "public"."user_roles" to "service_role";

grant truncate on table "public"."user_roles" to "service_role";

grant update on table "public"."user_roles" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";

grant delete on table "public"."whatsapp_chats" to "anon";

grant insert on table "public"."whatsapp_chats" to "anon";

grant references on table "public"."whatsapp_chats" to "anon";

grant select on table "public"."whatsapp_chats" to "anon";

grant trigger on table "public"."whatsapp_chats" to "anon";

grant truncate on table "public"."whatsapp_chats" to "anon";

grant update on table "public"."whatsapp_chats" to "anon";

grant delete on table "public"."whatsapp_chats" to "authenticated";

grant insert on table "public"."whatsapp_chats" to "authenticated";

grant references on table "public"."whatsapp_chats" to "authenticated";

grant select on table "public"."whatsapp_chats" to "authenticated";

grant trigger on table "public"."whatsapp_chats" to "authenticated";

grant truncate on table "public"."whatsapp_chats" to "authenticated";

grant update on table "public"."whatsapp_chats" to "authenticated";

grant delete on table "public"."whatsapp_chats" to "service_role";

grant insert on table "public"."whatsapp_chats" to "service_role";

grant references on table "public"."whatsapp_chats" to "service_role";

grant select on table "public"."whatsapp_chats" to "service_role";

grant trigger on table "public"."whatsapp_chats" to "service_role";

grant truncate on table "public"."whatsapp_chats" to "service_role";

grant update on table "public"."whatsapp_chats" to "service_role";

grant delete on table "public"."whatsapp_logs" to "anon";

grant insert on table "public"."whatsapp_logs" to "anon";

grant references on table "public"."whatsapp_logs" to "anon";

grant select on table "public"."whatsapp_logs" to "anon";

grant trigger on table "public"."whatsapp_logs" to "anon";

grant truncate on table "public"."whatsapp_logs" to "anon";

grant update on table "public"."whatsapp_logs" to "anon";

grant delete on table "public"."whatsapp_logs" to "authenticated";

grant insert on table "public"."whatsapp_logs" to "authenticated";

grant references on table "public"."whatsapp_logs" to "authenticated";

grant select on table "public"."whatsapp_logs" to "authenticated";

grant trigger on table "public"."whatsapp_logs" to "authenticated";

grant truncate on table "public"."whatsapp_logs" to "authenticated";

grant update on table "public"."whatsapp_logs" to "authenticated";

grant delete on table "public"."whatsapp_logs" to "service_role";

grant insert on table "public"."whatsapp_logs" to "service_role";

grant references on table "public"."whatsapp_logs" to "service_role";

grant select on table "public"."whatsapp_logs" to "service_role";

grant trigger on table "public"."whatsapp_logs" to "service_role";

grant truncate on table "public"."whatsapp_logs" to "service_role";

grant update on table "public"."whatsapp_logs" to "service_role";

grant delete on table "public"."whatsapp_messages" to "anon";

grant insert on table "public"."whatsapp_messages" to "anon";

grant references on table "public"."whatsapp_messages" to "anon";

grant select on table "public"."whatsapp_messages" to "anon";

grant trigger on table "public"."whatsapp_messages" to "anon";

grant truncate on table "public"."whatsapp_messages" to "anon";

grant update on table "public"."whatsapp_messages" to "anon";

grant delete on table "public"."whatsapp_messages" to "authenticated";

grant insert on table "public"."whatsapp_messages" to "authenticated";

grant references on table "public"."whatsapp_messages" to "authenticated";

grant select on table "public"."whatsapp_messages" to "authenticated";

grant trigger on table "public"."whatsapp_messages" to "authenticated";

grant truncate on table "public"."whatsapp_messages" to "authenticated";

grant update on table "public"."whatsapp_messages" to "authenticated";

grant delete on table "public"."whatsapp_messages" to "service_role";

grant insert on table "public"."whatsapp_messages" to "service_role";

grant references on table "public"."whatsapp_messages" to "service_role";

grant select on table "public"."whatsapp_messages" to "service_role";

grant trigger on table "public"."whatsapp_messages" to "service_role";

grant truncate on table "public"."whatsapp_messages" to "service_role";

grant update on table "public"."whatsapp_messages" to "service_role";

grant delete on table "public"."whatsapp_presence" to "anon";

grant insert on table "public"."whatsapp_presence" to "anon";

grant references on table "public"."whatsapp_presence" to "anon";

grant select on table "public"."whatsapp_presence" to "anon";

grant trigger on table "public"."whatsapp_presence" to "anon";

grant truncate on table "public"."whatsapp_presence" to "anon";

grant update on table "public"."whatsapp_presence" to "anon";

grant delete on table "public"."whatsapp_presence" to "authenticated";

grant insert on table "public"."whatsapp_presence" to "authenticated";

grant references on table "public"."whatsapp_presence" to "authenticated";

grant select on table "public"."whatsapp_presence" to "authenticated";

grant trigger on table "public"."whatsapp_presence" to "authenticated";

grant truncate on table "public"."whatsapp_presence" to "authenticated";

grant update on table "public"."whatsapp_presence" to "authenticated";

grant delete on table "public"."whatsapp_presence" to "service_role";

grant insert on table "public"."whatsapp_presence" to "service_role";

grant references on table "public"."whatsapp_presence" to "service_role";

grant select on table "public"."whatsapp_presence" to "service_role";

grant trigger on table "public"."whatsapp_presence" to "service_role";

grant truncate on table "public"."whatsapp_presence" to "service_role";

grant update on table "public"."whatsapp_presence" to "service_role";

grant delete on table "public"."work_progress" to "anon";

grant insert on table "public"."work_progress" to "anon";

grant references on table "public"."work_progress" to "anon";

grant select on table "public"."work_progress" to "anon";

grant trigger on table "public"."work_progress" to "anon";

grant truncate on table "public"."work_progress" to "anon";

grant update on table "public"."work_progress" to "anon";

grant delete on table "public"."work_progress" to "authenticated";

grant insert on table "public"."work_progress" to "authenticated";

grant references on table "public"."work_progress" to "authenticated";

grant select on table "public"."work_progress" to "authenticated";

grant trigger on table "public"."work_progress" to "authenticated";

grant truncate on table "public"."work_progress" to "authenticated";

grant update on table "public"."work_progress" to "authenticated";

grant delete on table "public"."work_progress" to "service_role";

grant insert on table "public"."work_progress" to "service_role";

grant references on table "public"."work_progress" to "service_role";

grant select on table "public"."work_progress" to "service_role";

grant trigger on table "public"."work_progress" to "service_role";

grant truncate on table "public"."work_progress" to "service_role";

grant update on table "public"."work_progress" to "service_role";


  create policy "Allow delete invoices"
  on "public"."client_invoices_gst"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "Allow select invoices"
  on "public"."client_invoices_gst"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow_update_invoices"
  on "public"."client_invoices_gst"
  as permissive
  for update
  to authenticated
using (true);



  create policy "Allow delete credentials"
  on "public"."credentials"
  as permissive
  for delete
  to public
using (true);



  create policy "Allow insert credentials"
  on "public"."credentials"
  as permissive
  for insert
  to public
with check (true);



  create policy "Allow select"
  on "public"."credentials"
  as permissive
  for select
  to public
using (true);



  create policy "allow delete credentials"
  on "public"."credentials"
  as permissive
  for delete
  to public
using (true);



  create policy "allow read credentials"
  on "public"."credentials"
  as permissive
  for select
  to anon
using (true);



  create policy "allow read"
  on "public"."credentials"
  as permissive
  for select
  to anon
using (true);



  create policy "allow update credentials"
  on "public"."credentials"
  as permissive
  for update
  to public
using (true);



  create policy "Allow insert meetings"
  on "public"."meetings"
  as permissive
  for insert
  to public
with check (true);



  create policy "Allow select"
  on "public"."meetings"
  as permissive
  for select
  to public
using (true);



  create policy "allow update meetings"
  on "public"."meetings"
  as permissive
  for update
  to public
using (true);



  create policy "Allow insert for service role only"
  on "public"."otp_logins"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Allow select for service role only"
  on "public"."otp_logins"
  as permissive
  for select
  to service_role
using (true);



  create policy "Allow update for service role only"
  on "public"."otp_logins"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "allow all"
  on "public"."role_permissions"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "allow public read system settings"
  on "public"."system_settings"
  as permissive
  for select
  to public
using (true);



  create policy "allow update system settings"
  on "public"."system_settings"
  as permissive
  for update
  to public
using (true);



  create policy "Allow all"
  on "public"."transporters"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "Allow delete only if permitted"
  on "public"."trips"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM ((public.users u
     JOIN public.user_roles ur ON ((u.id = ur.user_id)))
     JOIN public.role_permissions rp ON ((rp.role_id = ur.role_id)))
  WHERE ((u.auth_id = auth.uid()) AND (rp.page_name = 'trips.html'::text) AND (rp.action_name = 'delete'::text) AND (rp.can_access = true)))));



  create policy "Allow insert if permitted"
  on "public"."trips"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM ((public.users u
     JOIN public.user_roles ur ON ((u.id = ur.user_id)))
     JOIN public.role_permissions rp ON ((rp.role_id = ur.role_id)))
  WHERE ((u.auth_id = auth.uid()) AND (rp.page_name = 'trips.html'::text) AND (rp.action_name = 'create'::text) AND (rp.can_access = true)))));



  create policy "Allow update if permitted"
  on "public"."trips"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM ((public.users u
     JOIN public.user_roles ur ON ((u.id = ur.user_id)))
     JOIN public.role_permissions rp ON ((rp.role_id = ur.role_id)))
  WHERE ((u.auth_id = auth.uid()) AND (rp.page_name = 'trips.html'::text) AND (rp.action_name = 'edit'::text) AND (rp.can_access = true)))));



  create policy "Allow view if permitted"
  on "public"."trips"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM ((public.users u
     JOIN public.user_roles ur ON ((u.id = ur.user_id)))
     JOIN public.role_permissions rp ON ((rp.role_id = ur.role_id)))
  WHERE ((u.auth_id = auth.uid()) AND (rp.page_name = 'trips.html'::text) AND (rp.action_name = 'view'::text) AND (rp.can_access = true)))));



  create policy "authontication for users"
  on "public"."user_roles"
  as permissive
  for update
  to public
using (true)
with check (true);



  create policy "update user 2 "
  on "public"."user_roles"
  as permissive
  for insert
  to public
with check (true);



  create policy "update user"
  on "public"."user_roles"
  as permissive
  for update
  to public
using (true)
with check (true);


CREATE TRIGGER update_system_settings_timestamp_trigger BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_system_settings_timestamp();

CREATE TRIGGER trip_transporter_trigger BEFORE INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION public.set_trip_transporter();


