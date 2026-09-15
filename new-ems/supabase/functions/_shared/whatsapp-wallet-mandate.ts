// Validate provider evidence fetched server-side from the stored customer's
// /customers/:customer_id/tokens endpoint. Never accept browser token objects.
// This is not an activation/debit API; caller must verify tenant/mode ownership,
// account capability, mandate consent and current settings revision separately.
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
