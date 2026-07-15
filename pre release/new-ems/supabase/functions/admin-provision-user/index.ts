// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  action?: "provision" | "reset_password" | "set_password";
  email?: string;
  appUserId?: string;
  password?: string;
  displayName?: string;
  username?: string;
  phone?: string;
  roleCode?: string;
  divisionCode?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: corsHeaders });

    const jwt = authHeader.replace("Bearer ", "");
    const caller = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } });

    const { data: meData } = await caller.auth.getUser(jwt);
    const callerAuthUserId = meData?.user?.id;
    if (!callerAuthUserId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: superAdminCheck, error: superAdminErr } = await caller.rpc("is_super_admin");
    if (superAdminErr) {
      return new Response(JSON.stringify({ error: superAdminErr.message }), { status: 400, headers: corsHeaders });
    }
    if (!superAdminCheck) {
      return new Response(JSON.stringify({ error: "Only super_admin can provision users" }), { status: 403, headers: corsHeaders });
    }

    const body = (await req.json()) as Payload;
    const action = body.action || "provision";

    if (action === "set_password") {
      if (!body.appUserId) {
        return new Response(JSON.stringify({ error: "appUserId is required" }), { status: 400, headers: corsHeaders });
      }
      if (!body.password || body.password.length < 8) {
        return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: corsHeaders });
      }
      const { data: target, error: targetErr } = await admin
        .from("app_users")
        .select("id,auth_user_id,email,auth_provider")
        .eq("id", body.appUserId)
        .is("deleted_at", null)
        .maybeSingle();
      if (targetErr || !target?.id) {
        return new Response(JSON.stringify({ error: targetErr?.message || "User not found" }), { status: 404, headers: corsHeaders });
      }
      if (!target.auth_user_id || target.auth_provider !== "supabase") {
        return new Response(JSON.stringify({ error: "This account is not backed by Supabase Auth" }), { status: 400, headers: corsHeaders });
      }
      const { error: updateErr } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: body.password });
      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: corsHeaders });
      }
      await admin.from("audit_logs").insert({
        event_type: "user_credentials_resent",
        action: "temporary_password_set",
        module_code: "users",
        actor_auth_user_id: callerAuthUserId,
        entity_type: "app_users",
        entity_id: target.id,
        details: { email: target.email, delivery: ["email", "whatsapp"] },
        after_data: { email: target.email, password_changed: true },
        user_agent: req.headers.get("user-agent") || null,
        ip_address: req.headers.get("x-forwarded-for") || null
      });
      return new Response(JSON.stringify({ success: true, appUserId: target.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!body?.email) {
      return new Response(JSON.stringify({ error: "email is required" }), { status: 400, headers: corsHeaders });
    }

    if (action === "reset_password") {
      const { error: resetErr } = await admin.auth.resetPasswordForEmail(body.email);
      if (resetErr) return new Response(JSON.stringify({ error: resetErr.message }), { status: 400, headers: corsHeaders });

      await admin.from("audit_logs").insert({
        event_type: "user_password_reset",
        action: "reset_password_requested",
        module_code: "users",
        actor_auth_user_id: callerAuthUserId,
        entity_type: "app_users",
        entity_id: body.email,
        details: { email: body.email },
        after_data: { email: body.email },
        user_agent: req.headers.get("user-agent") || null,
        ip_address: req.headers.get("x-forwarded-for") || null
      });

      return new Response(JSON.stringify({ success: true, message: "Password reset initiated" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!body?.roleCode) {
      return new Response(JSON.stringify({ error: "roleCode is required for provisioning" }), { status: 400, headers: corsHeaders });
    }

    const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { display_name: body.displayName || body.email }
    });
    if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders });

    const authUserId = createdAuth.user?.id;
    if (!authUserId) return new Response(JSON.stringify({ error: "Auth user not created" }), { status: 400, headers: corsHeaders });

    const { data: appUser, error: appUserErr } = await admin
      .from("app_users")
      .insert({
        auth_user_id: authUserId,
        email: body.email,
        username: body.username || body.email,
        phone: body.phone || null,
        display_name: body.displayName || body.email,
        status: "active"
      })
      .select("id")
      .single();
    if (appUserErr) return new Response(JSON.stringify({ error: appUserErr.message }), { status: 400, headers: corsHeaders });

    const { data: role, error: roleErr } = await admin.from("roles").select("id").eq("code", body.roleCode).maybeSingle();
    if (roleErr || !role?.id) return new Response(JSON.stringify({ error: roleErr?.message || "Invalid roleCode" }), { status: 400, headers: corsHeaders });

    const { error: urErr } = await admin.from("user_roles").insert({ user_id: appUser.id, role_id: role.id });
    if (urErr) return new Response(JSON.stringify({ error: urErr.message }), { status: 400, headers: corsHeaders });

    if (body.divisionCode) {
      const { data: division, error: divErr } = await admin.from("divisions").select("id").eq("code", body.divisionCode).maybeSingle();
      if (divErr || !division?.id) return new Response(JSON.stringify({ error: divErr?.message || "Invalid divisionCode" }), { status: 400, headers: corsHeaders });

      const { error: udErr } = await admin.from("user_divisions").insert({ user_id: appUser.id, division_id: division.id, scope: "assigned" });
      if (udErr) return new Response(JSON.stringify({ error: udErr.message }), { status: 400, headers: corsHeaders });
    }

    await admin.from("audit_logs").insert({
      event_type: "user_provision",
      action: "create",
      module_code: "users",
      actor_auth_user_id: callerAuthUserId,
      actor_app_user_id: null,
      entity_type: "app_users",
      entity_id: appUser.id,
      details: { email: body.email, roleCode: body.roleCode, divisionCode: body.divisionCode || null },
      after_data: { email: body.email, roleCode: body.roleCode, divisionCode: body.divisionCode || null },
      user_agent: req.headers.get("user-agent") || null,
      ip_address: req.headers.get("x-forwarded-for") || null
    });

    return new Response(JSON.stringify({ success: true, appUserId: appUser.id, authUserId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
  }
});
