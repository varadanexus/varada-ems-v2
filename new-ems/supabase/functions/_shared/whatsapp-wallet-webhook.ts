// Invoke only AFTER validating Meta's signature against the exact raw body,
// and BEFORE legacy webhook deduplication. Durable billing is independent of
// inbox retries, automation failures, and early delivery/status callbacks.
export async function recordWalletWebhook({admin,payload,mode,connectionForPhone}: any) {
  if (!['test','live'].includes(mode)) throw new Error('Wallet billing mode is not configured');
  if (payload?.object !== 'whatsapp_business_account') return;
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    if (change.field !== 'messages') continue;
    const value = change.value || {};
    const phone = String(value.metadata?.phone_number_id || '');
    if (!phone) continue;
    const connection = await connectionForPhone(admin,phone);
    if (!connection) continue; // Existing unconnected-number behavior; no guessed tenant.
    for (const [items,inbound] of [[value.messages || [],true],[value.statuses || [],false]] as any) {
      for (const item of items) {
        const kind = inbound ? 'inbound' : String(item.status || '');
        if (!['inbound','sent','delivered','read','failed'].includes(kind)) continue;
        if (!item.id) throw new Error('Billing event has no message identifier');
        const seconds = Number(item.timestamp);
        if (!Number.isFinite(seconds) || seconds<=0 || seconds>Date.now()/1000+300) throw new Error('Invalid billing event timestamp');
        const {error} = await admin.rpc('whatsapp_wallet_enqueue_event',{
          p_tenant:connection.tenant_id,p_mode:mode,p_connection:connection.id,p_meta_id:String(item.id),
          p_kind:kind,p_message_type:inbound?String(item.type || 'unsupported').slice(0,50):'status',
          p_occurred_at:new Date(seconds*1000).toISOString(),
          p_error:item.errors?.[0]?.code == null ? null : String(item.errors[0].code).slice(0,160),
          p_pricing:inbound?{}:item.pricing || {},
          p_callback_usage: !inbound && /^vnwallet:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(item.biz_opaque_callback_data || ''))
            ? item.biz_opaque_callback_data.slice(9) : null,
        });
        // Fail receipt if evidence could not be stored; Meta can retry safely.
        // A stored-but-unprocessed event returns normally for inbox processing.
        if (error) throw error;
      }
    }
  }
}
