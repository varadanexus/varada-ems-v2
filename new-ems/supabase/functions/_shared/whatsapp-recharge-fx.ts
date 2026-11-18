// Daily reference cache, not a bank FX quote or the existing message meter.
export function rechargeFx({rpc,fetchRate=fetch,now=()=>Date.now()}:any) {
  return {
    async snapshot() {
      let refreshError=null;
      if(await rpc('whatsapp_recharge_fx_claim_refresh',{})) {
        try {
          const response=await fetchRate('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.timeout(8000),redirect:'error'});
          if(!response.ok)throw new Error('Provider unavailable');
          const data=await response.json(),rate=data?.rates?.INR;
          const updated=data?.time_last_update_unix,next=data?.time_next_update_unix;
          if(data?.result!=='success'||data?.base_code!=='USD'||typeof rate!=='number'||!Number.isFinite(rate)||rate<1||rate>1000||
            !Number.isSafeInteger(updated)||!Number.isSafeInteger(next)||updated*1000>now()+300000||updated*1000<now()-172800000||next<=updated||next-updated>172800||
            (data.time_eol_unix && data.time_eol_unix*1000<=now()))throw new Error('Invalid or stale provider rate');
          await rpc('whatsapp_recharge_fx_record',{p_rate:rate.toFixed(8),p_updated:new Date(updated*1000).toISOString(),p_next:new Date(next*1000).toISOString()});
        }catch {refreshError='Automatic rate refresh failed. Only a still-valid stored rate or approved manual override may be used.';}
      }
      return {...await rpc('whatsapp_recharge_fx_snapshot',{}),refreshError,attributionUrl:'https://www.exchangerate-api.com',walletChargingChanged:false};
    },
  };
}
