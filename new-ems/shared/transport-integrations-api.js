import { getSupabaseClient } from "../config/supabase.js";

async function transportIntegration(action, payload = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("transport-integrations", {
    body: { action, ...payload }
  });
  if (error) {
    let message = error.message || "Transport integration request failed.";
    const context = error.context;
    if (context && typeof context.json === "function") {
      const details = await context.json().catch(() => null);
      if (details?.error) message = details.error;
      else if (details?.message) message = details.message;
    } else if (context && typeof context.text === "function") {
      const text = await context.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function notifyTransportTripCreated(tripId) {
  return transportIntegration("notify_trip_created", { tripId });
}

export function notifyTransportExpenseCreated(expenseId) {
  return transportIntegration("notify_expense_created", { expenseId });
}

export function notifyTransportPaymentCreated(paymentId) {
  return transportIntegration("notify_payment_created", { paymentId });
}

export function notifyPortalAccessCreated(payload) {
  return transportIntegration("notify_portal_access_created", payload);
}
