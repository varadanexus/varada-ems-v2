// Tenant identity always comes from the validated customer session, never body.
export function walletBilling({ admin, gateway, hmac, equal, mode, keyId, checkoutEnabled = false, resolveQuote }: any) {
  const rpc = async (name: string, parameters: any) => {
    const { data, error } = await admin.rpc(name, parameters);
    if (error) throw error;
    return data;
  };
  const wallet = async (tenant: string) => {
    const { data, error } = await admin.from('whatsapp_platform_wallets').select('*').eq('tenant_id', tenant).eq('mode', mode).maybeSingle();
    if (error) throw error;
    return data;
  };
  const validateOrder = (recharge: any, order: any) => {
    if (!/^order_[A-Za-z0-9]+$/.test(order?.id || '') ||
      (recharge.provider_order_id && order.id !== recharge.provider_order_id) ||
      order.receipt !== recharge.id || order.notes?.tenant_id !== recharge.tenant_id ||
      order.notes?.mode !== mode || order.notes?.purpose !== 'varada_service_advance' ||
      order.currency !== recharge.currency || Number(order.amount) !== Number(recharge.amount_minor)) {
      throw new Error('Order ownership or amount mismatch');
    }
  };
  const verifyPayment = async (recharge: any, paymentId: string) => {
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error('Invalid payment identifier');
    const payment = await gateway(`/payments/${encodeURIComponent(paymentId)}`);
    if (payment.id !== paymentId) throw new Error('Payment identifier mismatch');
    if (payment.status !== 'captured' || payment.captured !== true) throw new Error('Payment is not captured yet');
    if (payment.order_id !== recharge.provider_order_id || payment.currency !== recharge.currency || Number(payment.amount) !== Number(recharge.amount_minor)) throw new Error('Payment does not match this recharge');
    const order = await gateway(`/orders/${encodeURIComponent(recharge.provider_order_id)}`);
    validateOrder(recharge, order);
    return rpc('whatsapp_wallet_capture_recharge', {
      p_tenant: recharge.tenant_id, p_mode: mode, p_order_id: recharge.provider_order_id,
      p_payment_id: payment.id, p_amount_minor: payment.amount, p_currency: payment.currency,
      // Server verification time; payment.created_at is not capture time.
      p_captured_at: new Date().toISOString(),
    });
  };
  return {
    async autoTopupSettings(customer: any) {
      if(!['owner','admin'].includes(customer.role_code))throw new Error('Only workspace owners or admins can manage auto top-up');
      const {data,error}=await admin.from('whatsapp_platform_wallet_auto_topup_preferences').select('*')
        .eq('tenant_id',customer.tenant_id).eq('mode',mode).maybeSingle();
      if(error)throw error;
      const {data:history,error:historyError}=await admin.from('whatsapp_platform_wallet_auto_topup_audit')
        .select('revision,actor_id,created_at,settings').eq('tenant_id',customer.tenant_id).eq('mode',mode)
        .order('revision',{ascending:false}).limit(50);
      if(historyError)throw historyError;
      return {settings:data,history,mandateActivationAvailable:false};
    },
    async saveAutoTopup(customer: any, body: any) {
      if(!['owner','admin'].includes(customer.role_code))throw new Error('Only workspace owners or admins can manage auto top-up');
      if(body.confirmed!==true || typeof body.enabled!=='boolean')throw new Error('Explicit auto top-up preference acceptance required');
      for(const field of ['revision','thresholdMinor','creditMinor','maxDebitMinor','monthlyCapMinor']) {
        if(!Number.isSafeInteger(body[field]))throw new Error('Auto top-up limits must use integer currency subunits');
      }
      const settings=await rpc('whatsapp_wallet_save_auto_topup',{p_tenant:customer.tenant_id,p_mode:mode,p_user:customer.user_id,
        p_revision:body.revision,p_enabled:body.enabled,p_threshold:body.thresholdMinor,p_credit:body.creditMinor,
        p_max_debit:body.maxDebitMinor,p_monthly_cap:body.monthlyCapMinor,p_consent:body.consentVersion});
      return {settings,mandateActivationAvailable:false};
    },
    async summary(customer: any) {
      const current = await wallet(customer.tenant_id);
      const price = await rpc('whatsapp_wallet_resolve_message_price',{p_tenant:customer.tenant_id,p_at:new Date().toISOString()});
      const usd = (micros: any) => (Number(micros || 0) / 1000000).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
      return { wallet: current, servicePriceUsd: usd(price.usd_rate_micros), failedMessagePriceUsd: usd(price.usd_failed_rate_micros),
        messagePriceVersionId: price.id, messagePriceScope: price.tenant_id ? 'customer' : 'global', metaPaidDirectly: true,
        canManageAutoTopup: ['owner','admin'].includes(customer.role_code),
        availableCurrencies: ['INR','USD'], canChooseCurrency: ['owner','admin'].includes(customer.role_code) && !current?.enabled,
        rechargeEnabled: checkoutEnabled && Boolean(current?.enabled) && ['owner','admin'].includes(customer.role_code) };
    },
    async chooseCurrency(customer: any, body: any) {
      if (!['owner','admin'].includes(customer.role_code)) throw new Error('Only workspace owners or admins can choose wallet currency');
      if (!['INR','USD'].includes(body.currency)) throw new Error('This checkout currency is not configured yet');
      return {wallet:await rpc('whatsapp_wallet_choose_currency',{p_tenant:customer.tenant_id,p_user:customer.user_id,p_mode:mode,p_currency:body.currency})};
    },
    async history(customer: any, body: any) {
      const limit = Math.max(1, Math.min(100, Math.floor(Number(body.limit) || 50)));
      const offset = Math.max(0, Math.min(100000, Math.floor(Number(body.offset) || 0)));
      const ledger = body.register === 'ledger';
      const recharges = body.register === 'recharges';
      let query = admin.from(recharges ? 'whatsapp_platform_wallet_recharges' : ledger ? 'whatsapp_platform_wallet_ledger' : 'whatsapp_platform_wallet_usage')
        .select('*', { count: 'exact' }).eq('tenant_id', customer.tenant_id).eq('mode', mode);
      if (!ledger && !recharges && body.connectionId) query = query.eq('connection_id', body.connectionId);
      if (!ledger && !recharges && ['inbound','outbound'].includes(body.direction)) query = query.eq('direction', body.direction);
      if (!ledger && !recharges && ['reserved','accepted','uncertain','charged','failed','released'].includes(body.state)) query = query.eq('state', body.state);
      const time = ledger || recharges ? 'created_at' : 'occurred_at';
      for (const [input, operator] of [['from','gte'],['to','lt']]) {
        if (body[input]) {
          const date = new Date(body[input]); if (!Number.isFinite(date.getTime())) throw new Error('Invalid date filter');
          query = query[operator](time, date.toISOString());
        }
      }
      const { data, error, count } = await query.order(time, {ascending:false}).order('id',{ascending:false}).range(offset,offset+limit-1);
      if (error) throw error;
      return { rows:data, count, offset, limit, mode };
    },
    async quoteRecharge(customer: any, body: any) {
      if (!checkoutEnabled) throw new Error('Wallet recharge checkout is not enabled yet');
      if (!['owner','admin'].includes(customer.role_code)) throw new Error('Only workspace owners or admins can recharge');
      const current = await wallet(customer.tenant_id);
      if (!current?.enabled) throw new Error('Wallet is not active');
      // Enable only gateway-confirmed currencies. Expansion must include correct
      // gateway subunit conventions and corresponding exchange-rate evidence.
      if (!['USD','INR'].includes(current.currency)) throw new Error('Checkout for this wallet currency is not configured');
      if (!Number.isSafeInteger(body.amountMinor) || body.amountMinor <= 0) throw new Error('Enter a valid recharge amount');
      if (typeof body.requestKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(body.requestKey)) throw new Error('Valid recharge request key required');
      const {data:existing,error}=await admin.from('whatsapp_platform_wallet_recharges').select('*')
        .eq('tenant_id',customer.tenant_id).eq('mode',mode).eq('request_key',body.requestKey).maybeSingle();
      if(error)throw error;
      let recharge=existing;
      const requestedCoupon=String(body.couponCode || '').trim().toUpperCase();
      if(existing && (Number(existing.credit_amount_minor)!==body.amountMinor || !existing.charge_breakdown
        || String(existing.charge_breakdown?.couponCode || '')!==requestedCoupon)) throw new Error('Pending recharge quote mismatch; reconcile before retrying');
      if(!recharge) {
        if(!resolveQuote)throw new Error('Verified tax and gateway policy is not configured');
        let redemption:any=null;
        if(requestedCoupon) {
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestKey)) throw new Error('Coupon checkout requires a secure request identifier');
          redemption=await rpc('whatsapp_wallet_reserve_coupon',{p_tenant:customer.tenant_id,p_code:requestedCoupon,p_subtotal:body.amountMinor,p_currency:current.currency,p_reservation_key:body.requestKey});
        }
        const chargeBreakdown=await resolveQuote(customer,current,body.amountMinor,Number(redemption?.discount_paise || 0));
        chargeBreakdown.couponCode=redemption?.coupon_code || '';
        chargeBreakdown.couponRedemptionId=redemption?.id || '';
        chargeBreakdown.couponName=redemption?.quote_snapshot?.couponName || '';
        try {
          recharge=await rpc('whatsapp_wallet_prepare_recharge',{p_tenant:customer.tenant_id,p_mode:mode,p_request_key:body.requestKey,p_amount_minor:body.amountMinor,p_exponent:2,p_charge_breakdown:chargeBreakdown});
        } catch(error) {
          if(redemption?.id) await admin.from('whatsapp_platform_billing_coupon_redemptions').update({status:'released',released_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',redemption.id).eq('status','reserved');
          throw error;
        }
      }
      return {rechargeId:recharge.id,amountMinor:recharge.amount_minor,creditAmountMinor:recharge.credit_amount_minor,
        currency:recharge.currency,chargeBreakdown:recharge.charge_breakdown,usdEquivalentMicros:recharge.usd_equivalent_micros,
        policyVersion:'service-balance-nonrefundable-v1',couponCode:recharge.charge_breakdown?.couponCode || '',state:recharge.state};
    },
    async discardQuote(customer: any, body: any) {
      if(!['owner','admin'].includes(customer.role_code))throw new Error('Only workspace owners or admins can discard recharge quotes');
      const discarded=await rpc('whatsapp_wallet_discard_quote',{p_tenant:customer.tenant_id,p_mode:mode,p_recharge:body.rechargeId,p_user:customer.user_id});
      return {discarded:discarded===true};
    },
    async createRecharge(customer: any, body: any) {
      if(!checkoutEnabled)throw new Error('Wallet recharge checkout is not enabled yet');
      if(!['owner','admin'].includes(customer.role_code))throw new Error('Only workspace owners or admins can recharge');
      if(body.policyAccepted!==true)throw new Error('Accept the recharge quote and non-refundable balance policy');
      if(!Number.isSafeInteger(body.acceptedTotalMinor))throw new Error('Valid quoted total required');
      let recharge=await rpc('whatsapp_wallet_accept_recharge',{p_tenant:customer.tenant_id,p_mode:mode,
        p_recharge:body.rechargeId,p_user:customer.user_id,p_total:body.acceptedTotalMinor,p_policy:body.policyVersion});
      const current=await wallet(customer.tenant_id);
      if(!current?.enabled)throw new Error('Wallet is not active');
      if (!recharge.provider_order_id) {
        const claimed = await rpc('whatsapp_wallet_claim_recharge_order',{p_recharge:recharge.id});
        if (!claimed) throw new Error('Recharge order is being prepared or needs reconciliation. Do not start another payment.');
        const order = await gateway('/orders',{method:'POST',body:JSON.stringify({amount:recharge.amount_minor,currency:recharge.currency,receipt:recharge.id,notes:{tenant_id:customer.tenant_id,mode,purpose:'varada_service_advance'}})});
        validateOrder(recharge, order);
        recharge = await rpc('whatsapp_wallet_bind_recharge',{p_recharge:recharge.id,p_order_id:order.id});
      }
      return { rechargeId:recharge.id,orderId:recharge.provider_order_id,keyId,amountMinor:recharge.amount_minor,
        creditAmountMinor:recharge.credit_amount_minor,chargeBreakdown:recharge.charge_breakdown,
        currency:recharge.currency,usdEquivalentMicros:recharge.usd_equivalent_micros,state:recharge.state };
    },
    async reconcileRecharge(customer: any, body: any) {
      if (!['owner','admin'].includes(customer.role_code)) throw new Error('Only workspace owners or admins can reconcile');
      if (!/^order_[A-Za-z0-9]+$/.test(body.orderId || '')) throw new Error('Valid gateway order ID required');
      const { data: recharge, error } = await admin.from('whatsapp_platform_wallet_recharges').select('*')
        .eq('id',body.rechargeId).eq('tenant_id',customer.tenant_id).eq('mode',mode).single();
      if (error || !recharge || !recharge.order_creation_started_at) throw new Error('Pending recharge not found');
      const order = await gateway(`/orders/${encodeURIComponent(body.orderId)}`);
      if (order.id !== body.orderId) throw new Error('Order identifier mismatch');
      validateOrder(recharge, order);
      const result = await rpc('whatsapp_wallet_bind_recharge',{p_recharge:recharge.id,p_order_id:order.id});
      // Recovery never creates another gateway order or credits an unverified payment.
      return { rechargeId:result.id, orderId:result.provider_order_id, state:result.state };
    },
    async verifyRecharge(customer: any, body: any) {
      const { data: recharge, error } = await admin.from('whatsapp_platform_wallet_recharges').select('*')
        .eq('id',body.rechargeId).eq('tenant_id',customer.tenant_id).eq('mode',mode).single();
      if (error || !recharge || !recharge.provider_order_id) throw new Error('Recharge not found or order not reconciled');
      const expected = await hmac(`${recharge.provider_order_id}|${body.paymentId}`);
      if (!equal(expected,String(body.signature || ''))) throw new Error('Invalid checkout signature');
      await verifyPayment(recharge,String(body.paymentId));
      return { credited:true,wallet:await wallet(customer.tenant_id) };
    },
    async capturedWebhook(payment: any) {
      if (!payment?.order_id || !payment?.id) return false;
      const { data: recharge, error } = await admin.from('whatsapp_platform_wallet_recharges').select('*').eq('mode',mode).eq('provider_order_id',payment.order_id).maybeSingle();
      if (error) throw error;
      if (!recharge) return false;
      await verifyPayment(recharge,payment.id);
      return true;
    },
  };
}
