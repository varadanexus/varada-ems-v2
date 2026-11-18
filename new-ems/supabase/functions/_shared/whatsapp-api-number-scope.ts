export async function enforceApiNumber(admin: any,customer: any,action: string,body: any) {
  if(customer.auth_kind!=='api_key' || !customer.api_connection_id) return;
  const connection=customer.api_connection_id;
  if(body.connectionId && body.connectionId!==connection) throw new Error('This API key cannot access another WhatsApp number.');
  if(action==='send_text' || action==='thread') {
    const {data,error}=await admin.from('whatsapp_platform_conversations').select('connection_id')
      .eq('id',body.conversationId).eq('tenant_id',customer.tenant_id).maybeSingle();
    if(error) throw error;
    if(data?.connection_id!==connection) throw new Error('This API key cannot access this conversation.');
  } else if(!['start_chat','list_templates','list_flows'].includes(action)) {
    // Shared workspace data requires an explicitly workspace-wide credential.
    throw new Error('This operation requires a workspace-wide API key.');
  }
  body.connectionId=connection;
}
