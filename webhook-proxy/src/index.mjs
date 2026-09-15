export default {
  async fetch(request, env) {
    const reply = (status, text) => new Response(text, { status, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return reply(200, "ok");
    if (url.pathname !== "/razorpay") return reply(404, "Not found");
    if (request.method !== "POST") return reply(405, "Method not allowed");
    if (!env.BILLING_EDGE_URL) return reply(503, "Webhook unavailable");
    if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return reply(415, "JSON required");
    const signature = request.headers.get("x-razorpay-signature") || "";
    if (!/^[a-f0-9]{64}$/i.test(signature)) return reply(401, "Invalid signature");
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "Body required");
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 524288) { await reader.cancel(); return reply(413, "Body too large"); }
      chunks.push(value);
    }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    // The origin verifies the HMAC. Do not forward cookies or caller credentials.
    const headers = new Headers({ "content-type": "application/json", "x-razorpay-signature": signature });
    if (env.PROXY_TOKEN) headers.set("x-varada-webhook-proxy", env.PROXY_TOKEN);
    const eventId = request.headers.get("x-razorpay-event-id");
    if (eventId) headers.set("x-razorpay-event-id", eventId);
    try {
      const response = await fetch(env.BILLING_EDGE_URL, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(20000) });
      await response.body?.cancel();
      if (response.ok) return reply(response.status, "Received");
      return reply(response.status >= 400 && response.status <= 599 ? response.status : 502, "Webhook not accepted");
    } catch { return reply(502, "Webhook temporarily unavailable"); }
  },
};
