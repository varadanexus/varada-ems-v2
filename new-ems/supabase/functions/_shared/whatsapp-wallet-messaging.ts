// All inputs come from the authorized, validated send path. No provider secrets
// or message content are stored in billing: only a SHA-256 payload fingerprint.
export async function walletSend({ admin, enabled, mode, tenantId, connectionId, requestKey, source, payload, send }: any) {
  const uncertain = (message: string) => Object.assign(new Error(message),{code:'WALLET_SEND_UNCERTAIN'});
  const rejectedError = (message: string) => Object.assign(new Error(message),{code:'WALLET_SEND_REJECTED'});
  const rpc = async (name: string, values: any) => {
    const { data, error } = await admin.rpc(name, values);
    if (error) throw error;
    return data;
  };
  let reservation: any = null;
  if (enabled) {
    if (!['test','live'].includes(mode)) throw new Error('Wallet billing mode is not configured');
    if (typeof requestKey !== 'string' || !/^[A-Za-z0-9:_-]{16,200}$/.test(requestKey)) throw new Error('A stable message request key is required');
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
    const hash = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    reservation = await rpc('whatsapp_wallet_reserve',{
      p_tenant:tenantId,p_mode:mode,p_connection:connectionId,p_request_key:requestKey,
      p_source:source,p_message_type:payload.type,p_request_hash:hash,
    });
    if (reservation.enabled && reservation.duplicate) {
      if (reservation.metaMessageId) return {graph:{messages:[{id:reservation.metaMessageId}]},replayed:true};
      if (reservation.state==='released') throw rejectedError('The previous attempt was rejected before acceptance. You can submit a fresh attempt.');
      throw uncertain('This send is already recorded and must be reconciled before retrying. No second message was sent.');
    }
  }
  const settle = async (result: string, code: string) => {
    if (!reservation?.enabled) return;
    try { await rpc('whatsapp_wallet_settle',{p_usage:reservation.usageId,p_result:result,p_error:code}); }
    catch { throw uncertain('The send outcome could not be recorded. Billing reconciliation is required before retrying.'); }
  };
  let response: Response, graph: any;
  try {
    response = await send(reservation?.enabled ? {...payload,biz_opaque_callback_data:`vnwallet:${reservation.usageId}`} : payload);
    graph = await response.json();
  } catch (error) {
    await settle('uncertain','transport_or_response_unknown');
    throw uncertain('The send result is unknown. Check message status before retrying.');
  }
  if (!response.ok || !graph?.messages?.[0]?.id) {
    // Only an explicit provider 4xx rejection proves no acceptance. Timeouts,
    // server failures and malformed success retain their reserved balance.
    const rejected = response.status>=400 && response.status<500 && response.status!==408 && graph?.error?.code;
    await settle(rejected ? 'rejected' : 'uncertain',String(graph?.error?.code || 'provider_result_unknown'));
    const message=graph?.error?.error_user_msg || graph?.error?.message || 'Message acceptance could not be confirmed.';
    throw rejected ? rejectedError(message) : uncertain(message);
  }
  if (reservation?.enabled) {
    try {
      await rpc('whatsapp_wallet_bind',{p_usage:reservation.usageId,p_meta_id:String(graph.messages[0].id)});
    } catch {
      throw uncertain('Meta accepted the message but its billing record needs reconciliation. Do not resend.');
    }
  }
  return {graph,replayed:false};
}
