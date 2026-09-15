// Pure quote calculation. Rates must come from a verified, versioned server
// policy for the customer's tax location, currency and payment method.
// Never use browser-supplied rates or infer a gateway tariff from currency alone.
export function walletRechargeQuote(creditMinor: number, policy: any, discountMinor = 0) {
  const integer = (value: any, max: number, label: string) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`Invalid ${label}`);
    return BigInt(value);
  };
  const credit = integer(creditMinor, 1000000000, 'recharge amount');
  const discount = integer(discountMinor, Number(credit), 'coupon discount');
  if (!credit) throw new Error('Recharge amount must be positive');
  if (!policy?.id || !['INR', 'USD'].includes(policy.currency)) throw new Error('Verified recharge policy required');
  const gstRate = integer(policy.serviceGstBps, 10000, 'service GST rate');
  const gatewayRate = integer(policy.gatewayBps, 9999, 'gateway rate');
  const gatewayGstRate = integer(policy.gatewayGstBps, 10000, 'gateway GST rate');
  const fixedFee = integer(policy.gatewayFixedMinor, 1000000000, 'fixed gateway fee');
  const round = (amount: bigint, rate: bigint) => (amount * rate + 5000n) / 10000n;
  const taxable = credit - discount;
  const serviceGst = round(taxable, gstRate);
  // If the processor charges on the total collected, solve for the smallest
  // total covering the quoted credit, tax and separately displayed processor fee.
  if (!['subtotal', 'collected_total'].includes(policy.gatewayBasis)) throw new Error('Gateway fee basis required');
  const base = taxable + serviceGst;
  let total = base;
  let fee = 0n;
  let feeGst = 0n;
  for (let i = 0; i < 1000; i++) {
    fee = round(policy.gatewayBasis === 'collected_total' ? total : base, gatewayRate) + fixedFee;
    feeGst = round(fee, gatewayGstRate);
    const next = base + fee + feeGst;
    if (next > 1000000000n) throw new Error('Checkout total exceeds supported amount');
    if (next === total) return {
      policyId: policy.id, currency: policy.currency, creditMinor,
      discountMinor: Number(discount), taxableMinor: Number(taxable),
      serviceGstMinor: Number(serviceGst), gatewayFeeMinor: Number(fee), gatewayGstMinor: Number(feeGst),
      totalMinor: Number(total), serviceGstBps: policy.serviceGstBps,
      gatewayBps: policy.gatewayBps, gatewayGstBps: policy.gatewayGstBps,
      gatewayFixedMinor: policy.gatewayFixedMinor, gatewayBasis: policy.gatewayBasis,
    };
    total = next;
  }
  throw new Error('Gateway quote did not converge');
}
