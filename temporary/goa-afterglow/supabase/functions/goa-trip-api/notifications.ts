import webpush from 'npm:web-push@3.6.7';
type Rpc=(name:string,data:unknown)=>Promise<any>;
export function tripNotifications(rpc:Rpc,env:(key:string)=>string){
 const publicKey=env('VAPID_PUBLIC_KEY'),privateKey=env('VAPID_PRIVATE_KEY');
 if(publicKey&&privateKey)webpush.setVapidDetails('mailto:prudhvisanker@gmail.com',publicKey,privateKey);
 const db=(action:string,session:string,data:unknown={})=>rpc('goa_server_push',{p_action:action,p_session:session,p_data:data});
 const configured=()=>!!(publicKey&&privateKey);
 function appUrl(value:unknown){const url=new URL(String(value));const main=['https://www.varadanexus.com','https://varadanexus.com'];if(main.includes(url.origin)&&url.pathname==='/goa/')return url.origin+'/goa/';if(url.origin==='https://goa-afterglow-trip.clever-sky-9771.chatgpt.site'&&url.pathname==='/')return url.origin+'/';throw Error('Invalid trip app address')}
 function endpoint(value:unknown){const url=new URL(String(value));if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.href.length>4096||!(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)||url.hostname.endsWith('.notify.windows.com')))throw Error('Unsupported push notification service');return url.href}
 async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
 return {
  config:()=>({configured:configured(),publicKey:configured()?publicKey:null}),
  async subscribe(session:string,data:any){if(!configured())throw Error('Trip notifications are not configured yet');const sub=data.subscription;const url=endpoint(sub?.endpoint);if(!/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(sub?.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{20,30}={0,2}$/.test(sub?.keys?.auth||''))throw Error('Invalid push subscription');await db('subscribe',session,{endpoint_hash:await hash(url),endpoint:url,p256dh:sub.keys.p256dh,auth:sub.keys.auth,app_url:appUrl(data.app_url)});return {enabled:true}},
  async unsubscribe(session:string,data:any){await db('unsubscribe',session,{endpoint_hash:await hash(endpoint(data.endpoint))});return {enabled:false}},
  status:(session:string)=>db('status',session),
  async enqueue(session:string,kind:string,section:string){if(!configured())return null;return db('event',session,{kind,section})},
  async enqueueDirect(session:string,recipient:string){if(!configured())return null;return rpc('goa_server_push_direct',{p_session:session,p_recipient:recipient})},
  async deliver(session:string,event:any,kind:string,section:string){
   if(!event)return {delivered:0,failed:0,subscribed:0};
   const text:Record<string,string>={message:'There is a new message in your trip.',direct:'You received a private message from a crew member.',plan:'Your crew added a new itinerary plan.',poll:'There is a new trip poll waiting for your vote.',expense:'A shared expense was added to the trip.',checklist:'There is a new item on your trip checklist.',file:'A new ticket, stay, booking, or trip file was added.',settings:'Your admin updated the trip details.',test:'Trip notifications are working on this device.'};
   let delivered=0,failed=0;
   await Promise.allSettled(event.subscriptions.map(async(sub:any)=>{
    try{await webpush.sendNotification({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify({title:'Goa Afterglow',body:text[kind]||'Your trip has an update.',tag:'goa-'+kind,url:sub.app_url+'#'+section,event_id:event.id}),{TTL:3600,urgency:'normal',timeout:10000});delivered++}
    catch(error){failed++;const code=(error as {statusCode?:number}).statusCode;if(code===404||code===410)await db('expire',session,{endpoint_hash:sub.endpoint_hash})}
   }));
   await db('finish',session,{id:event.id,delivered,failed});return {delivered,failed,subscribed:event.subscriptions.length};
  },
  async countdown(tripId:string){
   if(!configured())return {delivered:0,failed:0,subscribed:0,reason:'not_configured'};
   const event=await rpc('goa_server_push_countdown',{p_action:'prepare',p_trip:tripId,p_data:{}});
   if(!event?.send)return {delivered:0,failed:0,subscribed:Number(event?.subscribed||0),reason:event?.reason||'not_due'};
   const days=Number(event.days),title=days===0?'Goa starts today! 🌴':days===1?'1 day to Goa 🌴':`${days} days to Goa 🌴`;
   const body=days===0?'The wait is over. Open Afterglow for today’s plans.':days===1?'Almost time—check tickets, stays, and the latest itinerary.':`Your crew’s countdown is on. Open Afterglow to see the latest plan.`;
   let delivered=0,failed=0;
   await Promise.allSettled((event.subscriptions||[]).map(async(sub:any)=>{
    try{await webpush.sendNotification({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify({title,body,tag:'goa-trip-countdown',renotify:true,url:sub.app_url+'#overview',countdown_days:days}),{TTL:82800,urgency:'low',timeout:10000});delivered++}
    catch(error){failed++;const code=(error as {statusCode?:number}).statusCode;if(code===404||code===410)await rpc('goa_server_push_countdown',{p_action:'expire',p_trip:tripId,p_data:{endpoint_hash:sub.endpoint_hash,run_date:event.run_date}})}
   }));
   await rpc('goa_server_push_countdown',{p_action:'finish',p_trip:tripId,p_data:{run_date:event.run_date,delivered,failed}});return {delivered,failed,subscribed:event.subscriptions.length,days};
  }
 };
}

