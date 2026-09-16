// Read-only transition analysis. It never cancels subscriptions or alters grants.
export function paygTransitionReport(subscriptions: any[], assignments: any[], mode: string, nowMs = Date.now(), reconciliations: any[] = []) {
  if (!['test','live'].includes(mode) || !Number.isFinite(nowMs)) throw new Error('Valid transition mode and time required');
  const retainedCodes=new Set(['extra_agent_seat','extra_whatsapp_number','extra_integration']);
  const terminal=new Set(['cancelled','completed','expired']);
  const reconciledIds=new Set(reconciliations.filter(r=>{
    const s=subscriptions.find(s=>s.id===r?.subscription_id),snapshot=r?.source_snapshot?.subscription;
    return r?.mode===mode && s && snapshot && terminal.has(s.status) &&
      ['status','current_end','subscription_kind','addon_code','paid_count','updated_at'].every(k=>s[k]===snapshot[k]);
  }).map(r=>r.subscription_id));
  const modeUnknown=subscriptions.filter(s=>!['test','live'].includes(s.safe_metadata?.mode));
  const inMode=subscriptions.filter(s=>s.safe_metadata?.mode===mode);
  const current=inMode.filter(s=>!terminal.has(s.status));
  const stopRenewals=current.filter(s=>s.subscription_kind!=='addon' || !retainedCodes.has(s.addon_code));
  const retainedSubscriptions=current.filter(s=>s.subscription_kind==='addon' && retainedCodes.has(s.addon_code));
  const stoppedIds=new Set(stopRenewals.map(s=>s.id));
  const retainedCapacity=assignments.filter(a=>a.status==='active' && retainedCodes.has(a.addon_code));
  const bundledCapacity=retainedCapacity.filter(a=>a.source_subscription_id && stoppedIds.has(a.source_subscription_id));
  const blockers=stopRenewals.map(s=>({code:s.subscription_kind==='addon'?'included_feature_subscription':'base_subscription',
    subscriptionId:s.id,providerSubscriptionId:s.provider_subscription_id,status:s.status,cancelAtCycleEnd:Boolean(s.cancel_at_cycle_end),
    currentEnd:s.current_end || null,detail:'Reconcile paid-through service and confirm provider cancellation before activating usage billing.'}));
  for(const addon of bundledCapacity) blockers.push({code:'bundled_paid_capacity',subscriptionId:addon.source_subscription_id,
    addonCode:addon.addon_code,quantity:addon.quantity,detail:'Preserve this paid capacity before replacing its parent subscription.'} as any);
  for(const subscription of modeUnknown) blockers.push({code:'unverified_subscription_mode',subscriptionId:subscription.id,
    detail:'Verify whether this subscription is test or live before making a transition decision.'} as any);
  // A terminal provider state does not settle the customer's unused paid period.
  // An active capacity assignment also survives cancellation until explicitly reconciled.
  for(const subscription of inMode.filter(s=>terminal.has(s.status))) {
    const end=subscription.current_end ? Date.parse(subscription.current_end) : NaN;
    if(subscription.subscription_kind!=='addon' || !retainedCodes.has(subscription.addon_code)) {
      if((!Number.isFinite(end) || end>nowMs) && !reconciledIds.has(subscription.id)) blockers.push({code:'paid_through_reconciliation',subscriptionId:subscription.id,
        currentEnd:subscription.current_end || null,
        detail:'Confirm the unused paid period is preserved or financially reconciled before usage charging starts.'} as any);
    }
    for(const addon of retainedCapacity.filter(a=>a.source_subscription_id===subscription.id)) blockers.push({
      code:'terminal_subscription_capacity',subscriptionId:subscription.id,addonCode:addon.addon_code,quantity:addon.quantity,
      detail:'This active capacity grant references an ended subscription. Verify its paid-through entitlement and replacement before transition.'} as any);
  }
  return {mode,readyForSubscriptionTransition:blockers.length===0,blockers,
    reconciliations:reconciliations.filter(r=>r?.mode===mode).map(r=>({subscriptionId:r.subscription_id,outcome:r.outcome,evidenceReference:r.evidence_reference,reason:r.reason,createdAt:r.created_at})),
    retainedSubscriptions:retainedSubscriptions.map(s=>({id:s.id,addonCode:s.addon_code,status:s.status,providerSubscriptionId:s.provider_subscription_id})),
    retainedCapacity:retainedCapacity.map(a=>({addonCode:a.addon_code,quantity:a.quantity,sourceSubscriptionId:a.source_subscription_id || null})),
    note:'This checks stored subscription records only. Live provider verification, financial reconciliation, feature access and wallet activation checks are still required.'};
}
