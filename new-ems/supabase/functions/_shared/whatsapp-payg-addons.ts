const CAPACITY_CODES=new Set(['extra_agent_seat','extra_whatsapp_number','extra_integration']);
// Quotes from the actual catalog, never hard-coded historical INR prices.
// Quantity means additional recurring capacity, not replacement of paid grants.
export function paygAddonQuote(addon: any,quantity: number,gross: (base: number)=>any) {
  if (!CAPACITY_CODES.has(addon?.code)) throw new Error('This feature is already included; only seats, numbers and integrations are paid add-ons.');
  if(addon.status!=='active' || !addon.is_self_service || addon.billing_model!=='recurring' || !['month','year'].includes(addon.billing_interval)) throw new Error('This capacity add-on is not available for self-service checkout.');
  const minimum=Number(addon.minimum_quantity ?? 1),step=Number(addon.quantity_step ?? 1),maximum=Number(addon.maximum_quantity ?? 10000);
  if(!Number.isSafeInteger(quantity) || quantity<Math.max(1,minimum) || quantity>maximum || !Number.isSafeInteger(step) || step<1 || (quantity-minimum)%step) throw new Error('Select an allowed additional capacity quantity.');
  if(addon.quantity_enabled===false && quantity!==1) throw new Error('This add-on supports one unit per purchase.');
  const price=String(addon.unit_amount);
  if(!/^\d+(\.\d{1,2})?$/.test(price)) throw new Error('Add-on price has unsupported precision.');
  const [whole,fraction='']=price.split('.');
  const unit=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  const base=unit*BigInt(quantity);
  if(base<1n || base>1000000000n || !addon.current_price_version_id) throw new Error('A valid published add-on price is required.');
  if(!['USD','INR'].includes(addon.currency)) throw new Error('Add-on checkout currency is not configured.');
  const breakdown=gross(Number(base));
  return {addonCode:addon.code,name:addon.name,quantity,billingInterval:addon.billing_interval,currency:addon.currency,
    unitBaseMinor:Number(unit),recurringBaseMinor:Number(base),priceVersionId:addon.current_price_version_id,
    gstMinor:breakdown.packageGstPaise,gatewayFeeMinor:breakdown.gatewayAdjustmentPaise,totalMinor:breakdown.checkoutAmountPaise,
    baseSubscriptionRequired:false};
}
