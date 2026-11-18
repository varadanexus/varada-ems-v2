// Server-side, idempotent ZeptoMail notifications for customer onboarding milestones.

const FROM_EMAIL = "no-reply@varadanexus.com";
const FROM_NAME = "Varada Nexus WhatsApp Solutions";
const PORTAL_URL = "https://www.varadanexus.com/whatsapp-platform/workspace/";

type MilestoneDefinition = {
  step: number;
  title: string;
  subject: string;
  message: string;
  ctaLabel: string;
  ctaPath: string;
};

const MILESTONES: Record<string, MilestoneDefinition> = {
  workspace_created: {
    step: 1,
    title: "Your business workspace is ready",
    subject: "Workspace created successfully",
    message: "Your secure Varada Nexus WhatsApp Solutions workspace has been created. You can now complete business verification and prepare your Meta onboarding.",
    ctaLabel: "Open your workspace",
    ctaPath: "",
  },
  verification_submitted: {
    step: 2,
    title: "Business verification submitted",
    subject: "Business verification submitted successfully",
    message: "We received your business details and supporting documents. Our verification team will review the submission and notify you when the review is complete.",
    ctaLabel: "View verification status",
    ctaPath: "verification/",
  },
  verification_verified: {
    step: 2,
    title: "Your business verification is complete",
    subject: "Business verification approved",
    message: "Your submitted business information and supporting evidence have been approved. You can now continue with Meta Business onboarding.",
    ctaLabel: "Continue onboarding",
    ctaPath: "onboarding/",
  },
  meta_connected: {
    step: 3,
    title: "Meta Business connected successfully",
    subject: "Meta Business connection completed",
    message: "Your Meta Business portfolio and WhatsApp Business Account have been connected securely to your workspace.",
    ctaLabel: "View onboarding",
    ctaPath: "onboarding/",
  },
  number_confirmed: {
    step: 4,
    title: "WhatsApp business number confirmed",
    subject: "WhatsApp number connected successfully",
    message: "Your WhatsApp business number is now connected to the workspace. Messaging features will become available according to your active plan and number status in Meta.",
    ctaLabel: "View business numbers",
    ctaPath: "accounts/",
  },
  team_member_joined: {
    step: 5,
    title: "Your first team member has joined",
    subject: "Team setup step completed",
    message: "A team member has accepted the secure workspace invitation. Your shared workspace team setup is now complete.",
    ctaLabel: "Manage your team",
    ctaPath: "team/",
  },
  subscription_activated: {
    step: 5,
    title: "Your subscription is active",
    subject: "Subscription activated successfully",
    message: "Razorpay has confirmed your payment authorization and your WhatsApp Solutions subscription is now active. Your workspace access has been updated according to the selected plan.",
    ctaLabel: "Open billing and usage",
    ctaPath: "billing/?checkout=success",
  },
};

function env(name: string) { return Deno.env.get(name) || ""; }
function escapeHtml(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}
function authorization() {
  const token = env("ZEPTO_SEND_MAIL_TOKEN").trim();
  if (!token) throw new Error("ZeptoMail delivery is not configured.");
  return token.toLowerCase().startsWith("zoho-enczapikey") ? token : `Zoho-enczapikey ${token}`;
}

async function ownerDetails(admin: any, tenantId: string) {
  const [{ data: tenant, error: tenantError }, { data: owner, error: ownerError }] = await Promise.all([
    admin.from("whatsapp_platform_tenants").select("name,owner_email").eq("id", tenantId).single(),
    admin.from("whatsapp_platform_users").select("display_name,email").eq("tenant_id", tenantId).eq("role_code", "owner").eq("status", "active").limit(1).maybeSingle(),
  ]);
  if (tenantError) throw tenantError;
  if (ownerError) throw ownerError;
  const email = String(owner?.email || tenant?.owner_email || "").trim().toLowerCase();
  if (!email) throw new Error("The workspace has no registered owner email.");
  return { email, name: String(owner?.display_name || tenant?.name || email).trim(), companyName: String(tenant?.name || "your business").trim() };
}

export async function sendWhatsAppMilestoneEmail(admin: any, tenantId: string, milestoneCode: string, supplied?: { email?: string; name?: string; companyName?: string }) {
  const milestone = MILESTONES[milestoneCode];
  if (!milestone) throw new Error(`Unknown WhatsApp milestone: ${milestoneCode}`);
  const resolved = supplied?.email
    ? { email: String(supplied.email).trim().toLowerCase(), name: String(supplied.name || supplied.email).trim(), companyName: String(supplied.companyName || "your business").trim() }
    : await ownerDetails(admin, tenantId);
  const { data: deliveryId, error: claimError } = await admin.rpc("whatsapp_platform_claim_milestone_email", {
    p_tenant_id: tenantId,
    p_milestone_code: milestoneCode,
    p_recipient_email: resolved.email,
    p_recipient_name: resolved.name,
  });
  if (claimError) throw claimError;
  if (!deliveryId) return { sent: false, duplicate: true };

  const completed = Math.min(5, Math.max(1, milestone.step));
  const progress = Array.from({ length: 5 }, (_, index) => `<span style="display:inline-block;width:18%;height:5px;border-radius:99px;background:${index < completed ? "#22d78c" : "#d9e5df"};margin-right:2%"></span>`).join("");
  const href = `${PORTAL_URL}${milestone.ctaPath}`;
  const subject = `${milestone.subject} | ${resolved.companyName}`;
  const html = `<div style="margin:0;background:#f3f7f5;padding:32px 14px;font-family:Arial,Helvetica,sans-serif;color:#13231c"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #d7e4dd;border-radius:18px;overflow:hidden"><div style="padding:28px 34px;background:#061d14;color:#fff"><div style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#35dd94">Varada Nexus · WhatsApp Solutions</div><h1 style="font-size:27px;line-height:1.2;margin:10px 0 0">${escapeHtml(milestone.title)}</h1></div><div style="padding:30px 34px"><div style="margin-bottom:24px">${progress}<div style="font-size:12px;color:#718079;margin-top:8px">Onboarding progress · Step ${completed} of 5 completed</div></div><p>Hello ${escapeHtml(resolved.name)},</p><p style="line-height:1.65;color:#40524a">${escapeHtml(milestone.message)}</p><div style="padding:16px 18px;margin:22px 0;background:#f0f8f4;border:1px solid #d1e9dc;border-radius:12px"><strong>${escapeHtml(resolved.companyName)}</strong><br><span style="font-size:13px;color:#5b7066">Successful completion recorded for your registered business account.</span></div><p style="margin:28px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#14c97b;color:#062418;text-decoration:none;font-weight:700;padding:14px 21px;border-radius:10px">${escapeHtml(milestone.ctaLabel)}</a></p><p style="font-size:13px;color:#718079">This is an automated service notification sent to the registered workspace email. Please do not reply to this message.</p></div><div style="padding:18px 34px;background:#f7faf8;color:#718079;font-size:12px">Varada Nexus Private Limited · Secure business messaging operations</div></div></div>`;
  const text = `${milestone.title}\n\nHello ${resolved.name},\n\n${milestone.message}\n\n${resolved.companyName}\nStep ${completed} of 5 completed.\n\n${milestone.ctaLabel}: ${href}\n\nThis is an automated notification. Please do not reply.`;

  try {
    const apiBase = (env("ZEPTO_API_BASE_URL") || "https://api.zeptomail.in").replace(/\/+$/, "");
    const response = await fetch(`${apiBase}/v1.1/email`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authorization() },
      body: JSON.stringify({
        from: { address: FROM_EMAIL, name: FROM_NAME },
        to: [{ email_address: { address: resolved.email, name: resolved.name } }],
        reply_to: [{ address: FROM_EMAIL, name: FROM_NAME }],
        subject,
        htmlbody: html,
        textbody: text,
        track_clicks: true,
        track_opens: true,
        client_reference: `wa-${milestoneCode}-${deliveryId}`,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `ZeptoMail rejected the message (${response.status}).`);
    const providerMessageId = String(payload?.data?.[0]?.message_id || payload?.message_id || "").slice(0, 500) || null;
    await admin.from("whatsapp_platform_milestone_emails").update({ status: "sent", provider_message_id: providerMessageId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", deliveryId);
    return { sent: true, duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Milestone email delivery failed.";
    await admin.from("whatsapp_platform_milestone_emails").update({ status: "failed", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", deliveryId);
    console.error("WhatsApp milestone email failed", { tenantId, milestoneCode, message });
    return { sent: false, duplicate: false, error: message };
  }
}
