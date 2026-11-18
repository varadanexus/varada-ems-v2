export const PAYG_CAPACITY_ADDONS = ['extra_agent_seat','extra_whatsapp_number','extra_integration'];
export function withStandaloneCapacity(master: any, totals: any[]) {
  const effects: any={extra_agent_seat:'team_member_limit',extra_whatsapp_number:'whatsapp_number_limit',extra_integration:'integration_limit'};
  const addons=[...(master?.addons || [])];
  const seen=new Set();
  for(const total of totals) {
    const code=total.addon_code,quantity=Number(total.quantity);
    if(!effects[code] || seen.has(code) || !Number.isSafeInteger(quantity) || quantity<1)throw new Error('Invalid standalone paid capacity totals');
    seen.add(code);
    // Separate entry preserves the existing assignment and its source evidence.
    // Capacity consumers sum entitlement effects across entries, not by code.
    addons.push({code,quantity,status:'active',billing_source:'payg_standalone',entitlement_effects:{[effects[code]]:1}});
  }
  return {...master,addons};
}
export async function platformEntitlement(admin: any,tenantId: string,enabled: boolean,mode: string) {
  if (enabled) {
    if (!['test','live'].includes(mode)) return {data:null,error:new Error('Wallet billing mode is not configured')};
    const {data:wallet,error}=await admin.from('whatsapp_platform_wallets').select('enabled').eq('tenant_id',tenantId).eq('mode',mode).maybeSingle();
    if(error) return {data:null,error};
    if(wallet?.enabled) {
      const {data:tenant,error:tenantError}=await admin.from('whatsapp_platform_tenants').select('status').eq('id',tenantId).single();
      if(tenantError) return {data:null,error:tenantError};
      const allowed=tenant?.status==='active';
      return {data:{allowed,state:allowed?'pay_per_use':'workspace_inactive',packageCode:'pay_per_use',billingModel:'usage',mode,
        reason:allowed?'Core features included; outgoing messages require sufficient service balance.':'This workspace is inactive.'},error:null};
    }
  }
  return admin.rpc('whatsapp_platform_billing_entitlement',{p_tenant_id:tenantId});
}
export function paygPackageMaster(master: any) {
  const base=master?.package || {};
  const entitlements={...base.entitlements};
  for(const [key,value] of Object.entries(entitlements)) if(value===false || value==='none') entitlements[key]=true;
  Object.assign(entitlements,{team_inbox:true,contacts:true,templates:true,campaigns:true,flows:true,automations:true,api_access:true,integrations:true,priority_support:true,analytics:'enterprise'});
  return {...master,billingModel:'usage',package:{...base,code:'pay_per_use',name:'Pay per use',status:'active',billing_model:'free',currency:'USD',monthly_amount:0,annual_amount:0,trial_days:0,
    // Existing higher base capacity is grandfathered, not silently removed.
    team_member_limit:base.team_member_limit===undefined?3:base.team_member_limit,
    whatsapp_number_limit:base.whatsapp_number_limit===undefined?1:base.whatsapp_number_limit,
    integration_limit:base.integration_limit===undefined?1:base.integration_limit,
    contact_limit:null,monthly_message_limit:null,template_limit:null,flow_limit:null,campaign_limit:null,automation_limit:null,entitlements},
    addons:master?.addons || [],
    availableAddons:(master?.availableAddons || []).filter((addon: any)=>PAYG_CAPACITY_ADDONS.includes(addon.code))};
}
