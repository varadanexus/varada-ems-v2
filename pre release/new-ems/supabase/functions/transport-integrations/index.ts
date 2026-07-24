// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DEFAULT_TEMPLATE_SIDS = {
  ems_account_access_ready: "HXd0c2969823293635ae653bbafcdb3e7f",
  trip_update_v1: "HXd8a5ab2b0295e9271e04037448eda159",
  expense_update_v1: "HX1e0d2241c09a5e04509aae900777837c",
  payment_update_v1: "HX599c0b958b071caac666e8826f9a7995",
  access_notification_v1: "HXb41a4c3c42e1e6633b0e5a94da9782a9",
  document_ready_v1: "HX1dd8d011a3f6f9898808911fe779e1b5"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function formatAmount(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

async function getCaller(req: Request, admin: any) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.replace("Bearer ", "");
  const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
  const { data: userData } = await caller.auth.getUser(jwt);
  const authUserId = userData?.user?.id;
  if (!authUserId) return null;
  const { data: appUser } = await admin
    .from("app_users")
    .select("id,email,display_name,status,deleted_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!appUser?.id || appUser.deleted_at) return null;
  return { ...appUser, authUserId };
}

async function requireStaffCaller(req: Request, admin: any) {
  const caller = await getCaller(req, admin);
  if (!caller?.id) throw new Error("Unauthorized");
  if (String(caller.status || "active").toLowerCase() !== "active") {
    throw new Error("Inactive user");
  }
  return caller;
}

function templateSidFor(alias: string) {
  const envMap: Record<string, string> = {
    ems_account_access_ready: env("EMS_ACCOUNT_ACCESS_READY_CONTENT_SID"),
    trip_update_v1: env("TRANSPORT_TWILIO_TRIP_CONTENT_SID"),
    expense_update_v1: env("TRANSPORT_TWILIO_EXPENSE_CONTENT_SID"),
    payment_update_v1: env("TRANSPORT_TWILIO_PAYMENT_CONTENT_SID"),
    access_notification_v1: env("TRANSPORT_TWILIO_ACCESS_CONTENT_SID"),
    document_ready_v1: env("TRANSPORT_TWILIO_DOCUMENT_CONTENT_SID")
  };
  return envMap[alias] || DEFAULT_TEMPLATE_SIDS[alias] || "";
}

function fallbackMessage(alias: string, variables: Record<string, string>) {
  if (alias === "ems_account_access_ready") {
    return [
      `Hello ${variables["1"] || "User"}, your Varada Nexus EMS access for ${variables["2"] || "your assigned account"} is ready.`,
      "Use the secure page below to sign in or install the Varada Nexus app for your assigned account."
    ].join("\n\n");
  }
  if (alias === "trip_update_v1") {
    return [
      `Hello ${variables["1"] || "Transporter"},`,
      "A new trip has been created.",
      `Route: ${variables["2"] || "-"}`,
      `Truck Number: ${variables["3"] || "-"}`,
      `Transporter: ${variables["4"] || "-"}`,
      `Load: ${variables["5"] || "-"}`,
      "Thank you."
    ].join("\n");
  }
  if (alias === "expense_update_v1") {
    return [
      `Hello ${variables["1"] || "Partner"},`,
      "An expense has been recorded.",
      `Expense Type: ${variables["2"] || "-"}`,
      `Amount: ${variables["3"] || "-"}`,
      `Trip ID: ${variables["4"] || "-"}`,
      "Thank you."
    ].join("\n");
  }
  if (alias === "payment_update_v1") {
    return [
      `Hello ${variables["1"] || "Partner"},`,
      "A payment has been processed.",
      `Payment ID: ${variables["2"] || "-"}`,
      `Amount: ${variables["3"] || "-"}`,
      `Trip ID: ${variables["4"] || "-"}`,
      `Status: ${variables["5"] || "-"}`,
      "Thank you."
    ].join("\n");
  }
  if (alias === "document_ready_v1") {
    return [
      `Hello ${variables["1"] || "Sir/Madam"},`,
      `Your ${variables["2"] || "document"} ${variables["3"] || ""} for ${variables["4"] || "-"} from Varada Nexus is ready.`,
      "It has also been emailed to you.",
      "Thank you."
    ].join("\n");
  }
  return [
    `Hello ${variables["1"] || "User"},`,
    "Your portal access is ready.",
    variables.portalLoginUrl ? `Login: ${variables.portalLoginUrl}` : null,
    variables.username ? `Username: ${variables.username}` : null,
    variables.portalUserCode ? `Portal code: ${variables.portalUserCode}` : null,
    variables.password ? `Temporary password: ${variables.password}` : null,
    "Please keep your credentials confidential."
  ].filter(Boolean).join("\n");
}

function renderedTemplateMessage(alias: string, variables: Record<string, string>) {
  return fallbackMessage(alias, variables);
}

async function ensureWhatsAppChat(admin: any, phone: string, name: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data: existing } = await admin.from("whatsapp_chats").select("*").eq("phone", normalized).maybeSingle();
  if (existing?.id) return existing;
  const { data, error } = await admin
    .from("whatsapp_chats")
    .insert({
      phone: normalized,
      name: name || normalized,
      last_message: "",
      unread_count: 0
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function recordWhatsAppDelivery(admin: any, args: {
  phone: string;
  name: string;
  templateAlias: string;
  sourceModule: string;
  sourceEvent: string;
  messageText: string;
  renderedPayload: Record<string, string>;
  sid?: string | null;
  status?: string | null;
}) {
  const chat = await ensureWhatsAppChat(admin, args.phone, args.name);
  if (!chat?.id) return;
  const nowIso = new Date().toISOString();
  await admin.from("whatsapp_messages").insert({
    chat_id: chat.id,
    phone: chat.phone,
    name: args.name || chat.name,
    direction: "outbound",
    message: args.messageText,
    message_sid: args.sid || null,
    status: args.status || "queued",
    template_alias: args.templateAlias || null,
    source_module: args.sourceModule,
    source_event: args.sourceEvent,
    rendered_payload: args.renderedPayload || {}
  });
  await admin.from("whatsapp_chats").update({
    name: args.name || chat.name,
    last_message: args.messageText,
    last_message_at: nowIso
  }).eq("id", chat.id);
  await admin.from("whatsapp_logs").insert({
    phone: chat.phone,
    template: args.templateAlias,
    template_alias: args.templateAlias,
    status: args.status || "queued",
    message_sid: args.sid || null,
    message_text: args.messageText,
    source_module: args.sourceModule,
    source_event: args.sourceEvent,
    rendered_payload: args.renderedPayload || {}
  });
}

async function sendTwilioTemplateMessage({ toPhone, templateAlias, variables }: { toPhone: string; templateAlias: string; variables: Record<string, string>; }) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_WHATSAPP_FROM");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  const contentSid = templateSidFor(templateAlias);
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    return { configured: false, sent: false, sid: null, templateAlias, reason: "Twilio WhatsApp secrets are not configured." };
  }
  const normalized = normalizePhone(toPhone);
  if (!normalized) {
    return { configured: true, sent: false, sid: null, templateAlias, reason: "Recipient phone is missing or invalid." };
  }

  const params = new URLSearchParams();
  params.set("To", `whatsapp:+${normalized}`);
  if (messagingServiceSid) {
    params.set("MessagingServiceSid", messagingServiceSid);
  } else {
    params.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);
  }

  if (contentSid) {
    if (!messagingServiceSid) {
      throw new Error(`Template ${templateAlias} requires TWILIO_MESSAGING_SERVICE_SID.`);
    }
    params.set("ContentSid", contentSid);
    params.set("ContentVariables", JSON.stringify(variables));
  } else {
    params.set("Body", fallbackMessage(templateAlias, variables));
  }

  const statusCallback = env("TRANSPORT_TWILIO_STATUS_CALLBACK_URL") || env("TWILIO_STATUS_CALLBACK_URL");
  if (statusCallback) params.set("StatusCallback", statusCallback);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Twilio WhatsApp send failed");
  }
  return {
    configured: true,
    sent: true,
    sid: payload.sid || null,
    templateAlias,
    contentSid: contentSid || null,
    phone: normalized
  };
}

async function loadTripSnapshot(admin: any, tripId: string) {
  const { data: trip, error } = await admin
    .from("transport_trips")
    .select("id,trip_no,trip_date,quantity_mt,route_id,truck_id,transport_transporter_id,division_id")
    .eq("id", tripId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!trip?.id) throw new Error("Trip not found");

  const [routeRes, truckRes, transporterRes] = await Promise.all([
    trip.route_id
      ? admin.from("transport_route_master").select("id,name,from_location,to_location").eq("id", trip.route_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    trip.truck_id
      ? admin.from("transport_trucks").select("id,name,code,registration_no").eq("id", trip.truck_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    trip.transport_transporter_id
      ? admin.from("transport_transporters").select("id,name,phone_number,contact_no").eq("id", trip.transport_transporter_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (routeRes.error) throw routeRes.error;
  if (truckRes.error) throw truckRes.error;
  if (transporterRes.error) throw transporterRes.error;

  return {
    trip,
    route: routeRes.data || null,
    truck: truckRes.data || null,
    transporter: transporterRes.data || null
  };
}

async function loadExpenseSnapshot(admin: any, expenseId: string) {
  const { data: expense, error } = await admin
    .from("transport_trip_expenses")
    .select("id,expense_no,trip_id,expense_date,category,amount,paid_by,notes")
    .eq("id", expenseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!expense?.id) throw new Error("Expense not found");
  const tripSnapshot = await loadTripSnapshot(admin, expense.trip_id);
  return { expense, ...tripSnapshot };
}

async function loadPaymentSnapshot(admin: any, paymentId: string) {
  const { data: payment, error } = await admin
    .from("transport_transporter_payments")
    .select("id,payment_no,transport_transporter_id,transporter_statement_id,payment_date,amount_paid,payment_mode,status")
    .eq("id", paymentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!payment?.id) throw new Error("Payment not found");

  const [transporterRes, statementRes] = await Promise.all([
    payment.transport_transporter_id
      ? admin.from("transport_transporters").select("id,name,phone_number,contact_no").eq("id", payment.transport_transporter_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    payment.transporter_statement_id
      ? admin.from("transport_transporter_statements").select("id,statement_no").eq("id", payment.transporter_statement_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (transporterRes.error) throw transporterRes.error;
  if (statementRes.error) throw statementRes.error;
  return {
    payment,
    transporter: transporterRes.data || null,
    statement: statementRes.data || null
  };
}

async function notifyTripCreated(admin: any, tripId: string) {
  const snapshot = await loadTripSnapshot(admin, tripId);
  const phone = snapshot.transporter?.phone_number || snapshot.transporter?.contact_no || "";
  const routeLabel = snapshot.route?.name || [snapshot.route?.from_location, snapshot.route?.to_location].filter(Boolean).join(" - ") || "-";
  const truckLabel = snapshot.truck?.registration_no || snapshot.truck?.name || snapshot.truck?.code || "-";
  const transporterName = snapshot.transporter?.name || "Transporter";
  const variables = {
    "1": transporterName,
    "2": routeLabel,
    "3": truckLabel,
    "4": transporterName,
    "5": `${Number(snapshot.trip.quantity_mt || 0).toFixed(3)} MT`
  };
  const result = await sendTwilioTemplateMessage({
    toPhone: phone,
    templateAlias: "trip_update_v1",
    variables
  });
  if (result?.sent) {
    await recordWhatsAppDelivery(admin, {
      phone,
      name: transporterName,
      templateAlias: "trip_update_v1",
      sourceModule: "transportation",
      sourceEvent: "trip_created",
      messageText: renderedTemplateMessage("trip_update_v1", variables),
      renderedPayload: variables,
      sid: result.sid,
      status: "sent"
    });
  }
  return {
    event: "trip_created",
    tripId,
    tripNo: snapshot.trip.trip_no || null,
    recipientName: transporterName,
    recipientPhone: normalizePhone(phone),
    whatsapp: result
  };
}

async function notifyExpenseCreated(admin: any, expenseId: string) {
  const snapshot = await loadExpenseSnapshot(admin, expenseId);
  const phone = snapshot.transporter?.phone_number || snapshot.transporter?.contact_no || "";
  const transporterName = snapshot.transporter?.name || "Transporter";
  const variables = {
    "1": transporterName,
    "2": snapshot.expense.category || "-",
    "3": formatAmount(snapshot.expense.amount),
    "4": snapshot.trip.trip_no || "-"
  };
  const result = await sendTwilioTemplateMessage({
    toPhone: phone,
    templateAlias: "expense_update_v1",
    variables
  });
  if (result?.sent) {
    await recordWhatsAppDelivery(admin, {
      phone,
      name: transporterName,
      templateAlias: "expense_update_v1",
      sourceModule: "transportation",
      sourceEvent: "expense_created",
      messageText: renderedTemplateMessage("expense_update_v1", variables),
      renderedPayload: variables,
      sid: result.sid,
      status: "sent"
    });
  }
  return {
    event: "expense_created",
    expenseId,
    expenseNo: snapshot.expense.expense_no || null,
    tripNo: snapshot.trip.trip_no || null,
    recipientName: transporterName,
    recipientPhone: normalizePhone(phone),
    whatsapp: result
  };
}

async function notifyPaymentCreated(admin: any, paymentId: string) {
  const snapshot = await loadPaymentSnapshot(admin, paymentId);
  const phone = snapshot.transporter?.phone_number || snapshot.transporter?.contact_no || "";
  const transporterName = snapshot.transporter?.name || "Transporter";
  const variables = {
    "1": transporterName,
    "2": snapshot.payment.payment_no || "-",
    "3": formatAmount(snapshot.payment.amount_paid),
    "4": snapshot.statement?.statement_no || "Approved statements",
    "5": String(snapshot.payment.status || "draft").toUpperCase()
  };
  const result = await sendTwilioTemplateMessage({
    toPhone: phone,
    templateAlias: "payment_update_v1",
    variables
  });
  if (result?.sent) {
    await recordWhatsAppDelivery(admin, {
      phone,
      name: transporterName,
      templateAlias: "payment_update_v1",
      sourceModule: "transportation",
      sourceEvent: "payment_created",
      messageText: renderedTemplateMessage("payment_update_v1", variables),
      renderedPayload: variables,
      sid: result.sid,
      status: "sent"
    });
  }
  return {
    event: "payment_created",
    paymentId,
    paymentNo: snapshot.payment.payment_no || null,
    recipientName: transporterName,
    recipientPhone: normalizePhone(phone),
    whatsapp: result
  };
}

async function notifyPortalAccessCreated(body: any) {
  const phone = body.recipientPhone || "";
  const variables = {
    "1": body.recipientName || body.displayName || body.username || "User",
    portalLoginUrl: body.portalLoginUrl || "",
    portalUserCode: body.portalUserCode || "",
    username: body.username || "",
    password: body.password || ""
  };
  const result = await sendTwilioTemplateMessage({
    toPhone: phone,
    templateAlias: "access_notification_v1",
    variables
  });
  if (result?.sent) {
    const admin = adminClient();
    await recordWhatsAppDelivery(admin, {
      phone,
      name: body.recipientName || body.displayName || body.username || "User",
      templateAlias: "access_notification_v1",
      sourceModule: "portal",
      sourceEvent: body.sourceEvent === "portal_credentials_resent" ? "portal_credentials_resent" : "portal_access_created",
      messageText: renderedTemplateMessage("access_notification_v1", variables),
      renderedPayload: variables,
      sid: result.sid,
      status: "sent"
    });
  }
  return {
    event: body.sourceEvent === "portal_credentials_resent" ? "portal_credentials_resent" : "portal_access_created",
    portalType: body.portalType || null,
    recipientName: body.recipientName || body.displayName || body.username || null,
    recipientPhone: normalizePhone(phone),
    portalLoginUrl: body.portalLoginUrl || null,
    portalUserCode: body.portalUserCode || null,
    username: body.username || null,
    whatsapp: result
  };
}

async function notifyEmsUserCreated(body: any) {
  const phone = body.recipientPhone || "";
  const variables = {
    "1": body.recipientName || body.username || "Team Member",
    portalLoginUrl: body.portalLoginUrl || "https://www.varadanexus.com/login",
    portalUserCode: body.roleName || "EMS User",
    username: body.username || "",
    password: body.password || ""
  };
  const result = await sendTwilioTemplateMessage({
    toPhone: phone,
    templateAlias: "access_notification_v1",
    variables
  });
  if (result?.sent) {
    const admin = adminClient();
    await recordWhatsAppDelivery(admin, {
      phone,
      name: body.recipientName || body.username || "Team Member",
      templateAlias: "access_notification_v1",
      sourceModule: "users",
      sourceEvent: body.sourceEvent === "ems_user_credentials_resent" ? "ems_user_credentials_resent" : "ems_user_created",
      messageText: renderedTemplateMessage("access_notification_v1", variables),
      renderedPayload: variables,
      sid: result.sid,
      status: "sent"
    });
  }
  return {
    event: body.sourceEvent === "ems_user_credentials_resent" ? "ems_user_credentials_resent" : "ems_user_created",
    recipientName: body.recipientName || body.username || null,
    recipientPhone: normalizePhone(phone),
    username: body.username || null,
    whatsapp: result
  };
}

async function sendEmsAccountAccessReady(body: any) {
  const phone = body.recipientPhone || "";
  const recipientName = body.recipientName || body.displayName || body.username || "User";
  const accessDescription = String(body.accessDescription || body.portalType || body.roleName || "your assigned account").trim();
  const variables = {
    "1": recipientName,
    "2": accessDescription
  };
  const result = await sendTwilioTemplateMessage({
    toPhone: phone,
    templateAlias: "ems_account_access_ready",
    variables
  });
  if (result?.sent) {
    const admin = adminClient();
    await recordWhatsAppDelivery(admin, {
      phone,
      name: recipientName,
      templateAlias: "ems_account_access_ready",
      sourceModule: body.sourceModule || "users",
      sourceEvent: "ems_account_access_message_sent",
      messageText: renderedTemplateMessage("ems_account_access_ready", variables),
      renderedPayload: variables,
      sid: result.sid,
      status: "sent"
    });
  }
  return {
    event: "ems_account_access_message_sent",
    recipientName,
    recipientPhone: normalizePhone(phone),
    accessDescription,
    whatsapp: result
  };
}

async function loadClientBillSnapshot(admin: any, billId: string) {
  const { data: bill, error } = await admin.from("transport_client_bills")
    .select("id,bill_no,transport_client_id,invoice_total,net_receivable").eq("id", billId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!bill?.id) throw new Error("Client bill not found");
  const { data: client } = await admin.from("transport_clients")
    .select("id,name,company_name,phone_number,contact_no").eq("id", bill.transport_client_id).maybeSingle();
  return { bill, client: client || null };
}
async function loadStatementSnapshot(admin: any, statementId: string) {
  const { data: statement, error } = await admin.from("transport_transporter_statements")
    .select("id,statement_no,transport_transporter_id,net_payable_total").eq("id", statementId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!statement?.id) throw new Error("Statement not found");
  const { data: transporter } = await admin.from("transport_transporters")
    .select("id,name,phone_number,contact_no").eq("id", statement.transport_transporter_id).maybeSingle();
  return { statement, transporter: transporter || null };
}
async function loadReceiptSnapshot(admin: any, receiptId: string) {
  const { data: receipt, error } = await admin.from("transport_client_receipts")
    .select("id,receipt_no,transport_client_id,client_bill_id,amount_received").eq("id", receiptId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!receipt?.id) throw new Error("Receipt not found");
  const [clientRes, billRes] = await Promise.all([
    admin.from("transport_clients").select("id,name,company_name,phone_number,contact_no").eq("id", receipt.transport_client_id).maybeSingle(),
    receipt.client_bill_id ? admin.from("transport_client_bills").select("id,bill_no").eq("id", receipt.client_bill_id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  return { receipt, client: clientRes.data || null, bill: billRes.data || null };
}

async function notifyBillGenerated(admin: any, billId: string) {
  const s = await loadClientBillSnapshot(admin, billId);
  const phone = s.client?.phone_number || s.client?.contact_no || "";
  const name = s.client?.company_name || s.client?.name || "Client";
  const variables = { "1": name, "2": "Bill", "3": s.bill.bill_no || "-", "4": `Rs. ${formatAmount(s.bill.invoice_total || s.bill.net_receivable)}` };
  const result = await sendTwilioTemplateMessage({ toPhone: phone, templateAlias: "document_ready_v1", variables });
  if (result?.sent) await recordWhatsAppDelivery(admin, { phone, name, templateAlias: "document_ready_v1", sourceModule: "transportation", sourceEvent: "client_bill_generated", messageText: renderedTemplateMessage("document_ready_v1", variables), renderedPayload: variables, sid: result.sid, status: "sent" });
  return { event: "client_bill_generated", billId, billNo: s.bill.bill_no || null, recipientName: name, recipientPhone: normalizePhone(phone), whatsapp: result };
}
async function notifyStatementGenerated(admin: any, statementId: string) {
  const s = await loadStatementSnapshot(admin, statementId);
  const phone = s.transporter?.phone_number || s.transporter?.contact_no || "";
  const name = s.transporter?.name || "Transporter";
  const variables = { "1": name, "2": "Statement", "3": s.statement.statement_no || "-", "4": `Rs. ${formatAmount(s.statement.net_payable_total)}` };
  const result = await sendTwilioTemplateMessage({ toPhone: phone, templateAlias: "document_ready_v1", variables });
  if (result?.sent) await recordWhatsAppDelivery(admin, { phone, name, templateAlias: "document_ready_v1", sourceModule: "transportation", sourceEvent: "transporter_statement_generated", messageText: renderedTemplateMessage("document_ready_v1", variables), renderedPayload: variables, sid: result.sid, status: "sent" });
  return { event: "transporter_statement_generated", statementId, statementNo: s.statement.statement_no || null, recipientName: name, recipientPhone: normalizePhone(phone), whatsapp: result };
}
async function notifyReceiptCreated(admin: any, receiptId: string) {
  const s = await loadReceiptSnapshot(admin, receiptId);
  const phone = s.client?.phone_number || s.client?.contact_no || "";
  const name = s.client?.company_name || s.client?.name || "Client";
  const variables = { "1": name, "2": s.receipt.receipt_no || "-", "3": formatAmount(s.receipt.amount_received), "4": s.bill?.bill_no || "-", "5": "RECEIVED" };
  const result = await sendTwilioTemplateMessage({ toPhone: phone, templateAlias: "payment_update_v1", variables });
  if (result?.sent) await recordWhatsAppDelivery(admin, { phone, name, templateAlias: "payment_update_v1", sourceModule: "transportation", sourceEvent: "client_receipt_created", messageText: renderedTemplateMessage("payment_update_v1", variables), renderedPayload: variables, sid: result.sid, status: "sent" });
  return { event: "client_receipt_created", receiptId, receiptNo: s.receipt.receipt_no || null, recipientName: name, recipientPhone: normalizePhone(phone), whatsapp: result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const admin = adminClient();
    await requireStaffCaller(req, admin);
    const action = String(body.action || "");
    if (!action) return json({ error: "Action is required." }, 400);

    if (action === "notify_trip_created") {
      if (!body.tripId) return json({ error: "tripId is required." }, 400);
      return json(await notifyTripCreated(admin, body.tripId));
    }
    if (action === "notify_expense_created") {
      if (!body.expenseId) return json({ error: "expenseId is required." }, 400);
      return json(await notifyExpenseCreated(admin, body.expenseId));
    }
    if (action === "notify_payment_created") {
      if (!body.paymentId) return json({ error: "paymentId is required." }, 400);
      return json(await notifyPaymentCreated(admin, body.paymentId));
    }
    if (action === "notify_portal_access_created") {
      return json(await notifyPortalAccessCreated(body));
    }
    if (action === "notify_ems_user_created") {
      return json(await notifyEmsUserCreated(body));
    }
    if (action === "send_ems_account_access_ready") {
      return json(await sendEmsAccountAccessReady(body));
    }
    if (action === "notify_bill_created") {
      if (!body.clientBillId) return json({ error: "clientBillId is required." }, 400);
      return json(await notifyBillGenerated(admin, body.clientBillId));
    }
    if (action === "notify_statement_created") {
      if (!body.statementId) return json({ error: "statementId is required." }, 400);
      return json(await notifyStatementGenerated(admin, body.statementId));
    }
    if (action === "notify_receipt_created") {
      if (!body.receiptId) return json({ error: "receiptId is required." }, 400);
      return json(await notifyReceiptCreated(admin, body.receiptId));
    }

    return json({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    return json({ error: error?.message || "Transport integration failed." }, 400);
  }
});
