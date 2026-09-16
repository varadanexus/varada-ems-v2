// Validate provider evidence fetched server-side from the stored customer's
// /customers/:customer_id/tokens endpoint. Never accept browser token objects.
// This is not an activation/debit API; caller must verify tenant/mode ownership,
// account capability, mandate consent and current settings revision separately.
// Build a zero-value authorisation order, NOT a recharge or debit. Inputs must
// be loaded server-side under the registration lock; never forward browser limits.
export function emandateAuthorisationOrder(customer: any, wallet: any, settings: any, registration: any, mode: string, nowSeconds: number) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!['test','live'].includes(mode) || !uuid.test(customer?.tenant_id || '')
    || !uuid.test(customer?.user_id || '') || !['owner','admin'].includes(customer?.role_code)
    || wallet?.tenant_id !== customer.tenant_id || wallet?.mode !== mode || wallet?.enabled !== true
    || wallet?.currency !== 'INR' || settings?.tenant_id !== customer.tenant_id || settings?.mode !== mode
    || settings?.currency !== 'INR' || settings?.requested_enabled !== true || settings?.state !== 'awaiting_mandate') {
    throw new Error('Active INR wallet and owned pending auto top-up settings required');
  }
  if (!uuid.test(registration?.id || '') || registration?.tenant_id !== customer.tenant_id || registration?.mode !== mode
    || registration?.actor_id !== customer.user_id || registration?.settings_revision !== settings.revision
    || !Number.isSafeInteger(settings.revision) || settings.revision < 1
    || settings.consent_version !== 'auto-topup-nonrefundable-v1'
    || registration?.consent_version !== 'auto-topup-emandate-v1' || registration?.confirmed !== true
    || !/^cust_[A-Za-z0-9]+$/.test(registration?.provider_customer_id || '')) {
    throw new Error('Current mandate registration identity, settings revision and explicit consent required');
  }
  const limit = settings.max_debit_minor;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000000000
    || !Number.isSafeInteger(settings.credit_minor) || settings.credit_minor < 1 || settings.credit_minor > limit
    || !Number.isSafeInteger(settings.monthly_cap_minor) || settings.monthly_cap_minor < limit
    || settings.monthly_cap_minor > 1000000000 || !Number.isSafeInteger(settings.threshold_minor)
    || settings.threshold_minor < 0 || settings.threshold_minor > 1000000000
    || registration.max_debit_minor !== limit || !Number.isSafeInteger(nowSeconds)
    || !Number.isSafeInteger(registration.expires_at_seconds) || registration.expires_at_seconds <= nowSeconds
    || registration.expires_at_seconds > nowSeconds + 366 * 86400) {
    throw new Error('Mandate gross limits or approved expiry invalid');
  }
  return { amount: 0, currency: 'INR', payment_capture: true, method: 'emandate',
    customer_id: registration.provider_customer_id, receipt: registration.id,
    token: { auth_type: 'netbanking', max_amount: limit, expire_at: registration.expires_at_seconds },
    notes: { tenant_id: customer.tenant_id, mode, purpose: 'varada_wallet_mandate',
      registration_id: registration.id, settings_revision: String(settings.revision) } };
}

// Read-only provider reconciliation. Caller must authenticate the request and
// lock/revalidate the pending registration before persisting this evidence.
// Do not route this zero-value payment to whatsapp_wallet_capture_recharge.
export async function verifyEmandateAuthorisation(gateway: any, customer: any, wallet: any, settings: any,
  registration: any, paymentId: string, mode: string, nowSeconds: number) {
  const expected = emandateAuthorisationOrder(customer, wallet, settings, registration, mode, nowSeconds);
  if (!/^order_[A-Za-z0-9]+$/.test(registration?.provider_order_id || '')
    || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error('Invalid stored authorisation order or payment identifier');
  const order = await gateway(`/orders/${encodeURIComponent(registration.provider_order_id)}`);
  if (order?.entity !== 'order' || order.id !== registration.provider_order_id || order.amount !== 0
    || order.currency !== 'INR' || order.receipt !== expected.receipt
    || order.notes?.tenant_id !== expected.notes.tenant_id || order.notes?.mode !== mode
    || order.notes?.purpose !== expected.notes.purpose || order.notes?.registration_id !== registration.id
    || order.notes?.settings_revision !== expected.notes.settings_revision) {
    throw new Error('Authorisation order ownership or purpose mismatch');
  }
  const payment = await gateway(`/payments/${encodeURIComponent(paymentId)}`);
  if (payment?.entity !== 'payment' || payment.id !== paymentId || payment.order_id !== order.id
    || payment.customer_id !== expected.customer_id || payment.currency !== 'INR' || payment.amount !== 0
    || payment.method !== 'emandate' || payment.status !== 'captured' || payment.captured !== true
    || payment.amount_refunded !== 0 || !/^token_[A-Za-z0-9]+$/.test(payment.token_id || '')) {
    throw new Error('Captured zero-value customer authorisation payment required');
  }
  const mandate = await fetchVerifiedEmandate(gateway, { tenant_id: customer.tenant_id, mode, currency: 'INR',
    provider_customer_id: expected.customer_id, provider_token_id: payment.token_id,
    max_debit_minor: expected.token.max_amount }, customer.tenant_id, mode, nowSeconds);
  if (mandate.maximumDebitMinor !== expected.token.max_amount
    || mandate.expiresAt !== new Date(expected.token.expire_at * 1000).toISOString()) {
    throw new Error('Provider mandate does not match the exact approved limit and expiry');
  }
  return { ...mandate, registrationId: registration.id, settingsRevision: settings.revision,
    providerCustomerId: expected.customer_id, providerOrderId: order.id, providerPaymentId: payment.id,
    verifiedAt: new Date(nowSeconds * 1000).toISOString(), walletCreditMinor: 0 };
}

export async function fetchVerifiedEmandate(gateway: any, stored: any, tenantId: string, mode: string, nowSeconds: number) {
  if(!['test','live'].includes(mode) || stored?.tenant_id!==tenantId || stored?.mode!==mode
    || stored?.currency!=='INR' || !/^cust_[A-Za-z0-9]+$/.test(stored?.provider_customer_id || '')
    || !/^token_[A-Za-z0-9]+$/.test(stored?.provider_token_id || ''))throw new Error('Stored mandate ownership or mode mismatch');
  const collection=await gateway(`/customers/${encodeURIComponent(stored.provider_customer_id)}/tokens`);
  if(collection?.entity!=='collection' || !Array.isArray(collection.items))throw new Error('Mandate provider evidence unavailable');
  const matching=collection.items.filter((token: any)=>token.id===stored.provider_token_id);
  if(matching.length!==1)throw new Error('Stored mandate token not uniquely present for this customer');
  return verifiedEmandate(matching[0],stored.provider_token_id,stored.max_debit_minor,nowSeconds);
}
export function verifiedEmandate(token: any, expectedTokenId: string, maxDebitMinor: number, nowSeconds: number) {
  if(!/^token_[A-Za-z0-9]+$/.test(expectedTokenId) || token?.id!==expectedTokenId || token?.entity!=='token') {
    throw new Error('Mandate token identity mismatch');
  }
  if(token.method!=='emandate' || token.recurring!==true || token.recurring_details?.status!=='confirmed') {
    throw new Error('A confirmed recurring e-mandate is required');
  }
  if(!Number.isSafeInteger(maxDebitMinor) || maxDebitMinor<=0 || !Number.isSafeInteger(token.max_amount)
    || token.max_amount<maxDebitMinor)throw new Error('Mandate limit does not cover the approved gross debit');
  if(!Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(token.expired_at) || token.expired_at<=nowSeconds) {
    throw new Error('Mandate expiry is missing or expired');
  }
  // Deliberately omit token secret, bank details, VPA and provider response body.
  return {providerTokenId:token.id,method:'emandate',currency:'INR',status:'confirmed',
    maximumDebitMinor:token.max_amount,expiresAt:new Date(token.expired_at*1000).toISOString()};
}
