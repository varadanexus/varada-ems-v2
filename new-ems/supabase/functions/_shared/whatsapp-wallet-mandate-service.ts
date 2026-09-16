// Authentication is supplied by the billing endpoint. Provider identities are
// always loaded from protected mappings, never customer request bodies.
export function walletMandateService({admin, gateway, helpers, resolveIdentity, hmac, equal, mode, keyId, enabled=false, now=()=>Math.floor(Date.now()/1000)}: any) {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const guard=(customer: any)=>{
    if (!enabled || mode!=='test') throw new Error('Test mandate registration is not enabled');
    if (!uuid.test(customer?.tenant_id || '') || !uuid.test(customer?.user_id || '')
      || !['owner','admin'].includes(customer?.role_code)) throw new Error('Authenticated workspace owner or admin required');
  };
  const rpc=async(name: string, parameters: any)=>{
    const {data,error}=await admin.rpc(name,parameters);if(error)throw error;return data;
  };
  const row=async(table: string, tenant: string, extra: any={})=>{
    let query=admin.from(table).select('*').eq('tenant_id',tenant).eq('mode',mode);
    for(const [field,value] of Object.entries(extra))query=query.eq(field,value);
    const {data,error}=await query.maybeSingle();if(error)throw error;return data;
  };
  const integer=(value: any)=>{
    if(typeof value==='string' && /^(0|[1-9][0-9]*)$/.test(value))value=Number(value);
    if(!Number.isSafeInteger(value))throw new Error('Stored mandate integer invalid');return value;
  };
  const loadPending=async(customer: any, id: string)=>{
    guard(customer);if(!uuid.test(id || ''))throw new Error('Valid registration identifier required');
    const slot=await row('whatsapp_platform_wallet_mandate_registration_slots',customer.tenant_id);
    if(slot?.registration_id!==id)throw new Error('Current pending registration required');
    const [registration,wallet,settings,binding,customerBinding]=await Promise.all([
      row('whatsapp_platform_wallet_mandate_registrations',customer.tenant_id,{id}),
      row('whatsapp_platform_wallets',customer.tenant_id),
      row('whatsapp_platform_wallet_auto_topup_preferences',customer.tenant_id),
      row('whatsapp_platform_wallet_mandate_orders',customer.tenant_id,{registration_id:id}),
      row('whatsapp_platform_wallet_mandate_customers',customer.tenant_id),
    ]);
    if(!registration || !wallet || !settings || registration.actor_id!==customer.user_id)throw new Error('Owned pending mandate records required');
    const normalizedSettings={...settings};
    for(const field of ['revision','threshold_minor','credit_minor','max_debit_minor','monthly_cap_minor'])normalizedSettings[field]=integer(settings[field]);
    const normalizedRegistration={...registration,settings_revision:integer(registration.settings_revision),
      max_debit_minor:integer(registration.max_debit_minor),expires_at_seconds:integer(registration.expires_at_seconds)};
    if(binding && (!customerBinding || binding.provider_customer_id!==customerBinding.provider_customer_id))throw new Error('Mandate order customer mapping mismatch');
    return {registration:normalizedRegistration,wallet,settings:normalizedSettings,binding,customerBinding};
  };
  return {
    async begin(customer: any, body: any) {
      guard(customer);
      if(!uuid.test(body.registrationId || '') || !Number.isSafeInteger(body.settingsRevision)
        || !Number.isSafeInteger(body.expiresAtSeconds) || body.confirmed!==true || body.consentVersion!=='auto-topup-emandate-v1')throw new Error('Explicit current mandate consent required');
      const result=await rpc('whatsapp_wallet_begin_mandate_registration',{p_tenant:customer.tenant_id,p_mode:mode,p_user:customer.user_id,
        p_id:body.registrationId,p_revision:body.settingsRevision,p_expires:body.expiresAtSeconds,p_consent:body.consentVersion,p_confirmed:true});
      return {registrationId:result.id,state:'prepared',autoTopupActive:false};
    },
    async authorise(customer: any, body: any) {
      const loaded=await loadPending(customer,body.registrationId);
      const identity=loaded.customerBinding ? null : await resolveIdentity(customer);
      const providerCustomer=await helpers.createEmandateCustomer({gateway,rpc,customer,...loaded,
        registration:loaded.registration,identity,binding:loaded.customerBinding,mode,nowSeconds:now()});
      const registration={...loaded.registration,provider_customer_id:providerCustomer.providerCustomerId,
        provider_order_id:loaded.binding?.provider_order_id};
      return helpers.createEmandateAuthorisation({gateway,rpc,customer,wallet:loaded.wallet,settings:loaded.settings,
        registration,mode,keyId,nowSeconds:now()});
    },
    async verify(customer: any, body: any) {
      const loaded=await loadPending(customer,body.registrationId);
      if(!loaded.binding || !/^pay_[A-Za-z0-9]+$/.test(body.paymentId || '') || !/^[0-9a-f]{64}$/i.test(body.signature || ''))throw new Error('Valid mandate payment callback required');
      const expected=await hmac(`${loaded.binding.provider_order_id}|${body.paymentId}`);
      if(!equal(expected,body.signature))throw new Error('Mandate callback signature invalid');
      const evidence=await helpers.verifyEmandateAuthorisation(gateway,customer,loaded.wallet,loaded.settings,
        {...loaded.registration,provider_customer_id:loaded.binding.provider_customer_id,provider_order_id:loaded.binding.provider_order_id},body.paymentId,mode,now());
      await rpc('whatsapp_wallet_record_verified_mandate',{p_tenant:customer.tenant_id,p_mode:mode,p_registration:loaded.registration.id,p_evidence:evidence});
      return {registrationId:loaded.registration.id,state:'authorization_verified',autoTopupActive:false,
        maximumDebitMinor:evidence.maximumDebitMinor,expiresAt:evidence.expiresAt};
    },
    async close(customer: any, body: any) {
      guard(customer);if(!uuid.test(body.registrationId || ''))throw new Error('Valid registration identifier required');
      const result=await rpc('whatsapp_wallet_close_mandate_registration',{p_tenant:customer.tenant_id,p_mode:mode,p_user:customer.user_id,
        p_registration:body.registrationId,p_outcome:body.outcome,p_reason:body.reason,p_confirmed:body.confirmed===true});
      return {registrationId:result.registration_id,state:result.outcome,autoTopupActive:false};
    },
  };
}
