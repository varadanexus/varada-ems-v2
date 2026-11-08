// Custom trip accounts. No calls to Supabase Auth. Secrets stay in Edge runtime.
import { tripNotifications } from './notifications.ts';
import { tripWhatsApp } from './whatsapp.ts';
const env=(key:string)=>Deno.env.get(key)||'';
const SUPABASE=env('SUPABASE_URL');
const SERVICE=env('SUPABASE_SERVICE_ROLE_KEY');
const TRIP='8412a56b-fccf-412f-b203-54cb3d1bf87d';
const ROOT='1UHh4f-MBU5xdeKFlDvCSEqS87t4T8_Pm';
const ORIGINS=new Set(['https://goa-afterglow-trip.clever-sky-9771.chatgpt.site','https://goa.varadanexus.com','https://www.varadanexus.com','https://varadanexus.com','http://127.0.0.1:4173','http://localhost:4173']);
const encoder=new TextEncoder();
const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b instanceof Uint8Array?b.buffer:b)).map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
const bytes=(s:string)=>Uint8Array.from(s.match(/.{2}/g)||[],x=>parseInt(x,16));
async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:600000},key,256))}
function equal(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
function contact(input:unknown){const v=String(input||'').trim();if(v.includes('@')){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)||v.length>254)throw Error('Enter a valid email address');return{contact:v.toLowerCase(),contact_kind:'email'}}const n=v.replace(/[\s()-]/g,'');if(!/^\+[1-9]\d{7,14}$/.test(n))throw Error('Enter a mobile number with country code, for example +91 98765 43210');return{contact:n,contact_kind:'mobile'}}
async function rpc(name:string,data:unknown){const res=await fetch(`${SUPABASE}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'},body:JSON.stringify(data)});const text=await res.text();const value=text?JSON.parse(text):null;if(!res.ok){const message=String(value?.message||'Request failed');if(value?.code==='23505')throw Error('An account already uses this email or mobile number. Sign in instead.');throw Error(message)}return value}
async function api(action:string,session:string,data:unknown={}){return rpc('goa_server_api',{p_action:action,p_session:session,p_data:data})}
async function access(action:string,session:string,data:unknown={}){return rpc('goa_server_access',{p_action:action,p_session:session,p_data:data})}
async function bookings(action:string,session:string,data:unknown={}){return rpc('goa_server_bookings',{p_action:action,p_session:session,p_data:data})}
async function expenseBills(action:string,session:string,data:unknown={}){return rpc('goa_server_expense_bills',{p_action:action,p_session:session,p_data:data})}
async function auth(action:string,data:unknown){return rpc('goa_server_auth',{p_action:action,p_data:data})}
const notifications=tripNotifications(rpc,env);
const whatsapp=tripWhatsApp(rpc,env);
function whatsappPhone(value:unknown){const p=String(value||'').trim().replace(/^whatsapp:/,'').replace(/[\s()-]/g,'');if(!/^\+[1-9]\d{7,14}$/.test(p))throw Error('Enter your WhatsApp number with country code');return p}
async function otpProof(id:string,phone:string,code:string){const key=await crypto.subtle.importKey('raw',encoder.encode(SERVICE),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(id+'|'+phone+'|'+code)))}
function otpCode(){const n=new Uint32Array(1);do{crypto.getRandomValues(n)}while(n[0]>=4294000000);return String(n[0]%1000000).padStart(6,'0')}
async function whatsappAdmin(data:any,session:string,raw:string){if(raw){const ctx=await access('context',session);if(ctx.trip_id===TRIP&&ctx.role==='admin')return;throw Error('Only the trip admin can manage WhatsApp')}const info=await auth('inspect',{invite_hash:await digest(String(data.setup_invite||''))});if(info.trip_id!==TRIP||info.role!=='admin')throw Error('Admin setup is required')}
async function notifyTrip(session:string,kind:string,section:string){
 try{const event=await notifications.enqueue(session,kind,section);if(!event)return;const task=notifications.deliver(session,event,kind,section).catch(()=>{});const runtime=(globalThis as any).EdgeRuntime;if(runtime?.waitUntil)runtime.waitUntil(task);else await task}catch{/* Notification failure must not discard a saved trip change. */}
}
function b64url(data:string|Uint8Array){const s=typeof data==='string'?data:String.fromCharCode(...data);return btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
let cached:{token:string,expires:number}|null=null;
async function googleToken(){if(cached&&cached.expires>Date.now()+60000)return cached.token;const raw=env('GOOGLE_SERVICE_ACCOUNT_JSON');if(!raw)throw Error('Drive service account is not configured');const sa=JSON.parse(raw);const now=Math.floor(Date.now()/1000);const claim={iss:sa.client_email,scope:'https://www.googleapis.com/auth/drive',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600};const unsigned=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64url(JSON.stringify(claim));const pem=sa.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(unsigned));const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64url(new Uint8Array(sig))})});const data=await res.json();if(!res.ok)throw Error('Drive service-account sign-in failed');cached={token:data.access_token,expires:Date.now()+data.expires_in*1000};return cached.token}
async function drive(path:string,options:RequestInit={}){const token=await googleToken();const res=await fetch('https://www.googleapis.com'+path,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});if(!res.ok){const d=await res.json().catch(()=>({}));const m=String(d.error?.message||'File storage request failed');if(m.includes('storage quota'))throw Error('Private file storage needs administrator attention.');throw Error(`Private file storage: ${m}`)}return res}
const folders=[
 {key:'travel',name:'01 Travel',children:[['tickets','01 Tickets'],['transfers','02 Transfers and Local Transport']]},
 {key:'stay',name:'02 Stay',children:[['confirmations','01 Confirmations'],['property','02 Property Details']]},
 {key:'itinerary',name:'03 Itinerary',children:[['plans','01 Plans'],['places','02 Places and Activities']]},
 {key:'expenses',name:'04 Expenses',children:[['receipts','01 Receipts'],['shared','02 Shared Costs']]},
 {key:'documents',name:'05 Shared Documents',children:[['general','01 General'],['exports','02 Trip Exports']]},
 {key:'memories',name:'06 Photos and Videos',children:[['photos','01 Photos'],['videos','02 Videos']]}
];
const categories=new Map(folders.flatMap(f=>f.children.map(([k,n])=>[`${f.key}/${k}`,{parent:f.name,name:n}])));
async function findFolder(parent:string,name:string,create=false){const q=`'${parent}' in parents and name = '${name.replace(/'/g,"\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;const data=await(await drive('/drive/v3/files?'+new URLSearchParams({q,fields:'files(id,name)',supportsAllDrives:'true',includeItemsFromAllDrives:'true'}))).json();if(data.files?.length)return data.files[0].id;if(!create)throw Error('The trip storage folders have not been prepared by the admin yet');const f=await(await drive('/drive/v3/files?supportsAllDrives=true&fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent],appProperties:{goa_trip:TRIP}})})).json();return f.id}
async function prepareStorage(){const root=await(await drive(`/drive/v3/files/${ROOT}?supportsAllDrives=true&fields=id,name,mimeType,driveId,capabilities(canAddChildren),permissions(type,role)`)).json();if(root.mimeType!=='application/vnd.google-apps.folder'||!root.capabilities?.canAddChildren)throw Error('The service account needs permission to add files to the selected Drive folder');const result=[];for(const f of folders){const p=await findFolder(ROOT,f.name,true);for(const [,n]of f.children)await findFolder(p,n,true);result.push(f.name)}return {root:root.name,folders:result,shared_drive:!!root.driveId,publicly_shared:root.permissions?.some((p:{type:string})=>p.type==='anyone')||false}}
async function categoryFolder(category:string){const f=categories.get(category);if(!f)throw Error('Choose a booking category');const p=await findFolder(ROOT,f.parent,true);return findFolder(p,f.name,true)}
async function chatFolder(){return findFolder(ROOT,'07 Chat Attachments',true)}
async function expenseBillFolder(){return categoryFolder('expenses/receipts')}
const ALLOWED_MIME=new Set(['application/pdf','image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','text/plain','text/csv','application/json','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const CHAT_MIME=new Set(['application/pdf','image/jpeg','image/png','image/webp','image/heic','text/plain','text/csv','application/json','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function chatSocket(req:Request){
 const offered=(req.headers.get('sec-websocket-protocol')||'').split(',').map(v=>v.trim());
 const credential=offered.find(v=>v.startsWith('session.'))?.slice(8)||'';
 if(!/^[a-f0-9]{64}$/.test(credential))throw Error('Chat sign-in is required');
 const session=await digest(credential);const ctx=await access('context',session);
 if(ctx.trip_id!==TRIP)throw Error('Trip access denied');
 if(ctx.agreement_required)throw Error('Accept the crew agreement before opening chat');
 const requested=Number(new URL(req.url).searchParams.get('after')||0);let after=Number.isSafeInteger(requested)&&requested>0?requested:0;
 const {socket,response}=Deno.upgradeWebSocket(req,{protocol:'goa-chat-v1',idleTimeout:0});
 let stopped=false,resolveClosed:()=>void=()=>{};const closed=new Promise<void>(resolve=>{resolveClosed=resolve});
 const runtime=(globalThis as any).EdgeRuntime;runtime?.waitUntil?.(closed);
 const leave=()=>rpc('goa_server_chat_presence',{p_session:session,p_peer:null,p_group:true,p_typing:false,p_online:false}).catch(()=>{});
 socket.onopen=()=>{
  socket.send(JSON.stringify({type:'ready',after}));
  void (async()=>{try{while(!stopped&&socket.readyState===WebSocket.OPEN){const update=await rpc('goa_server_chat_sync',{p_session:session,p_after:after,p_limit:100});after=Math.max(after,Number(update.last_event_id||0));socket.send(JSON.stringify({type:'sync',...update}));await pause(1000)}}catch(error){if(socket.readyState===WebSocket.OPEN){socket.send(JSON.stringify({type:'error',message:'Live chat is reconnecting.'}));socket.close(1011,'Live sync interrupted')}}})();
 };
 socket.onmessage=event=>{void (async()=>{try{const message=JSON.parse(String(event.data));if(message.type==='typing'){await rpc('goa_server_chat_presence',{p_session:session,p_peer:message.peer_id||null,p_group:message.peer_id?false:true,p_typing:message.typing===true,p_online:true})}else if(message.type==='ping'&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'pong'}))}catch{/* Invalid ephemeral events are ignored. */}})()};
 socket.onerror=()=>{stopped=true};
 socket.onclose=()=>{stopped=true;void leave();resolveClosed()};
 setTimeout(()=>{if(socket.readyState===WebSocket.OPEN)socket.close(1012,'Scheduled reconnect')},300000);
 return response;
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin');const cors={'Access-Control-Allow-Origin':origin&&ORIGINS.has(origin)?origin:'https://goa-afterglow-trip.clever-sky-9771.chatgpt.site','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(origin&&!ORIGINS.has(origin))return json({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if((req.headers.get('upgrade')||'').toLowerCase()==='websocket'){try{return await chatSocket(req)}catch(error){return json({error:error instanceof Error?error.message:'Chat connection failed'},401)}}
 if(req.method!=='POST')return json({error:'Use POST'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>15000000)return json({error:'File too large. Maximum 10 MB.'},413);
  const text=await req.text();if(text.length>15000000)return json({error:'File too large. Maximum 10 MB.'},413);
  const body=JSON.parse(text);const action=String(body.action||'');const data=body.data||{};
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown';
  const rawSession=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const session=await digest(rawSession);
  if(['whatsappSetup','whatsappStatus','sendAdminSetup','whatsappDelivery'].includes(action)){
   await whatsappAdmin(data,session,rawSession);
   if(action==='whatsappSetup')return json(await whatsapp.setup());
   if(action==='whatsappStatus')return json(await whatsapp.status(true));
   if(action==='sendAdminSetup'){
    const invite=await whatsapp.db('bootstrap',{invite_hash:await digest(String(data.setup_invite||'')),trip_id:TRIP});
    if(!await rpc('goa_server_rate',{p_key:await digest('admin-invite:'+invite.phone),p_limit:3}))throw Error('Please wait before sending another invitation');
    const message=await whatsapp.send('invite',invite.phone,{'1':'Trip admin','2':'https://www.varadanexus.com/goa/#join='+data.setup_invite});
    await whatsapp.db('delivery',{trip_id:TRIP,invite_id:invite.id,phone:invite.phone,message_sid:message.sid,status:message.status});return json({message_sid:message.sid,status:message.status});
   }
   const known=await whatsapp.db('delivery_lookup',{message_sid:String(data.message_sid),trip_id:TRIP});if(!known)throw Error('Trip message not found');return json(await whatsapp.delivery(data.message_sid));
  }
  if(action==='authOptions'){const status=await whatsapp.status();return json({whatsapp_available:status.configured&&status.templates.some((t:any)=>t.alias==='otp'&&t.status==='approved')})}
  if(action==='requestOtp'){
   const phone=whatsappPhone(data.phone),purpose=String(data.purpose||'login');
   if(!await rpc('goa_server_rate',{p_key:await digest('otp-ip:'+ip),p_limit:10})||!await rpc('goa_server_rate',{p_key:await digest('otp-phone:'+phone),p_limit:5}))return json({error:'Too many verification requests. Try again in 15 minutes.'},429);
   const templates=await whatsapp.status();if(!templates.configured||!templates.templates.some((t:any)=>t.alias==='otp'&&t.status==='approved'))throw Error('WhatsApp verification is waiting for template approval.');
   let draft:any={};let invite_hash='';
   if(purpose==='signup'||purpose==='test'){
    invite_hash=await digest(String(data.invite||''));const info=await auth('inspect',{invite_hash});if(info.trip_id!==TRIP)throw Error('Invitation belongs to a different trip');
    const c=contact(data.email||phone);if(purpose==='test'){draft={contact:info.contact}}else{const name=String(data.display_name||'').trim(),password=String(data.password||'');if(!name||name.length>100)throw Error('Enter your name');if(password.length<10||password.length>128)throw Error('Use a password with 10 to 128 characters');const salt=hex(crypto.getRandomValues(new Uint8Array(16)));draft={...c,display_name:name,salt,hash:await passwordHash(password,salt)}}
   }
   const id=crypto.randomUUID(),code=otpCode();const prepared=await whatsapp.db('prepare',{id,phone,purpose,trip_id:TRIP,invite_hash,draft,code_hash:await otpProof(id,phone,code)},purpose==='link'?session:null);
   if(prepared.eligible){try{const message=await whatsapp.send('otp',phone,{'1':code});await whatsapp.db('sent',{id,message_sid:message.sid});await whatsapp.db('delivery',{trip_id:TRIP,phone,message_sid:message.sid,status:message.status})}catch(e){await whatsapp.db('failed',{id});throw e}}
   return json({challenge_id:id,phone_hint:'•••• '+phone.slice(-4),expires_in:300,resend_after:60,message:'If this number can access the trip, a WhatsApp code has been sent.'});
  }
  if(action==='verifyOtp'){
   if(!await rpc('goa_server_rate',{p_key:await digest('otp-verify:'+ip),p_limit:30}))return json({error:'Too many attempts. Please try again later.'},429);
   const phone=whatsappPhone(data.phone),code=String(data.code||'');if(!/^\d{6}$/.test(code))throw Error('Enter the six-digit WhatsApp code');
   const token=random();const result=await whatsapp.db('verify',{id:String(data.challenge_id),trip_id:TRIP,session_hash:await digest(token),code_hash:await otpProof(String(data.challenge_id),phone,code)},rawSession?session:null);
   if(!result.ok)return json({error:result.error},400);if(result.test||result.linked)return json(result);return json({...result,access_token:token});
  }
  if(['inspectInvite','register','login','prepareStorage'].includes(action)){
   if(!await rpc('goa_server_rate',{p_key:await digest('ip:'+ip+':'+action),p_limit:action==='inspectInvite'?60:20}))return json({error:'Too many attempts. Please try again in 15 minutes.'},429);
  }
  if(action==='inspectInvite'){return json(await auth('inspect',{invite_hash:await digest(String(data.invite||''))}))}
  if(action==='register'||action==='login'){
   if(action==='register')throw Error('Verify your WhatsApp number to create an account.');
   const c=contact(data.contact);const password=String(data.password||'');if(password.length<10||password.length>128)throw Error('Use a password with 10 to 128 characters');
   if(!await rpc('goa_server_rate',{p_key:await digest('contact:'+c.contact),p_limit:10}))return json({error:'Too many sign-in attempts. Please try again in 15 minutes.'},429);
   const token=random();const session_hash=await digest(token);const invite_hash=data.invite?await digest(String(data.invite)):'';let result;
   if(action==='register'){
    if(!invite_hash)throw Error('Open your invitation link to create an account');
    const info=await auth('inspect',{invite_hash});if(info.trip_id!==TRIP)throw Error('Invitation belongs to a different trip');
    const display_name=String(data.display_name||'').trim();if(display_name.length<1||display_name.length>100)throw Error('Enter your name');
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));const hash=await passwordHash(password,salt);
    result=await auth('register',{...c,display_name,salt,hash,session_hash,invite_hash});
   }else{
    const found=await auth('lookup',c);const hash=await passwordHash(password,found?.salt||'00000000000000000000000000000000');
    if(!found||!equal(hash,found.hash))return json({error:'Email/mobile or password is incorrect'},401);
    if(invite_hash){const info=await auth('inspect',{invite_hash});if(info.trip_id!==TRIP)throw Error('Invitation belongs to a different trip')}
    result=await auth('login',{account_id:found.id,trip_id:TRIP,session_hash,invite_hash});
   }
   return json({...result,access_token:token});
  }
  if(action==='prepareStorage'){
   if(data.invite){const info=await auth('inspect',{invite_hash:await digest(String(data.invite))});if(info.trip_id!==TRIP||info.role!=='admin')throw Error('Admin access required')}
   else{const ctx=await access('context',session);if(ctx.trip_id!==TRIP||ctx.role!=='admin')throw Error('Admin access required')}
   const result=await prepareStorage();
   if(data.audit){const folder=await categoryFolder('documents/general');const q=`'${folder}' in parents and trashed = false`;const files=await(await drive('/drive/v3/files?'+new URLSearchParams({q,fields:'files(id,name,mimeType,size,appProperties)',supportsAllDrives:'true',includeItemsFromAllDrives:'true'}))).json();return json({...result,audit_files:files.files})}
   return json(result);
  }
  const ctx=await access('context',session);if(ctx.trip_id!==TRIP)throw Error('Trip access denied');
  if(action==='get'){
   if(ctx.agreement_required)return json({trip:{title:'Our Goa escape',departure:'',start:'',end:'',budget:'',notes:''},entries:[],members:[{trip_id:ctx.trip_id,user_id:ctx.user_id,display_name:ctx.display_name,role:ctx.role,is_owner:ctx.is_owner}],votes:[],files:[],expense_bills:[],agreement_required:true,agreement_version:ctx.agreement_version});
   const result=await api('get',session);result.members=await access('members',session);result.files=await bookings('list',session);result.expense_bills=await expenseBills('list',session);return json({...result,agreement_required:false,agreement_version:ctx.agreement_version});
  }
  if(action==='acceptAgreement')return json(await access('acceptAgreement',session,data));
  if(action==='logout')return json(await api('logout',session));
  if(ctx.agreement_required)throw Error('Accept the crew agreement before entering the trip');
  if(action==='setMemberRole'||action==='removeMember')return json(await access(action,session,data));
  if(action==='sendWhatsAppInvite'){
   if(ctx.role!=='admin')throw Error('Only the trip admin can invite participants');if(data.opt_in!==true)throw Error('Confirm the recipient agreed to receive this WhatsApp invitation');
   const phone=whatsappPhone(data.phone),label=String(data.label||'').trim();if(!label||label.length>100)throw Error('Enter the participant name');
   if(!await rpc('goa_server_rate',{p_key:await digest('wa-invite:'+ctx.user_id),p_limit:20}))throw Error('Invitation limit reached. Please try later');
   const templates=await whatsapp.status();if(!templates.templates.some((t:any)=>t.alias==='invite'&&t.status==='approved'))throw Error('The WhatsApp invitation template is waiting for approval.');
   const token=random();const invite=await whatsapp.db('create_invite',{phone,label,token_hash:await digest(token)},session);
   try{const message=await whatsapp.send('invite',phone,{'1':label,'2':'https://www.varadanexus.com/goa/#join='+token});await whatsapp.db('delivery',{trip_id:TRIP,invite_id:invite.id,phone,message_sid:message.sid,status:message.status});return json({token,message_sid:message.sid,status:message.status})}
   catch(e){await whatsapp.db('delivery',{trip_id:TRIP,invite_id:invite.id,phone,status:'failed'});throw e}
  }
  if(action==='pushConfig')return json(notifications.config());
  if(action==='pushSubscribe')return json(await notifications.subscribe(session,data));
  if(action==='pushUnsubscribe')return json(await notifications.unsubscribe(session,data));
  if(action==='pushStatus')return json(await notifications.status(session));
  if(action==='pushTest'){
   if(!await rpc('goa_server_rate',{p_key:await digest('push-test:'+ctx.user_id),p_limit:5}))throw Error('Please wait before sending another test notification');
   const event=await notifications.enqueue(session,'test','overview');return json(await notifications.deliver(session,event,'test','overview'));
  }
  if(action==='addExpense'){
   const payerId=String(data.payer_id||''),members=await access('members',session),payer=members.find((m:any)=>m.user_id===payerId);
   if(!payer)throw Error('Choose a current crew member who paid');
   const expense={title:String(data.title||'').trim(),amount:Number(data.amount),payer_id:payer.user_id,payer:payer.display_name,notes:String(data.notes||'').trim()};
   const attachment=data.attachment&&typeof data.attachment==='object'?data.attachment:null;
   const created=await api('add',session,{kind:'expense',data:expense});
   let uploaded:any=null;
   try{
    if(attachment){
     const mime=String(attachment.mime_type||''),name=String(attachment.name||'').replace(/[\x00-\x1f/\\]/g,'_').slice(0,180).trim(),raw=String(attachment.base64||'');
     if(!CHAT_MIME.has(mime))throw Error('This bill type is not supported');if(!name)throw Error('Choose a bill');if(raw.length>13981016)throw Error('Maximum bill size is 10 MB');
     const bin=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));if(!bin.length||bin.length>10485760)throw Error('Maximum bill size is 10 MB');
     if(!await rpc('goa_server_rate',{p_key:await digest('expense-bill:'+ctx.user_id),p_limit:30}))throw Error('Upload limit reached. Try again in 15 minutes.');
     const folder=await expenseBillFolder(),boundary='goa_expense_'+crypto.randomUUID(),meta={name,mimeType:mime,parents:[folder],appProperties:{goa_trip:TRIP,goa_expense:String(created.id),goa_uploader:ctx.user_id}};
     const multipart=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,bin,`\r\n--${boundary}--`]);
     uploaded=await(await drive('/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:multipart})).json();
     await expenseBills('record',session,{entry_id:created.id,drive_id:uploaded.id,name:uploaded.name,mime_type:uploaded.mimeType,size_bytes:Number(uploaded.size||bin.length)});
    }
   }catch(error){if(uploaded?.id)await drive(`/drive/v3/files/${uploaded.id}?supportsAllDrives=true`,{method:'DELETE'}).catch(()=>{});await api('delete',session,{id:created.id}).catch(()=>{});throw error}
   await notifyTrip(session,'expense','expenses');return json(created);
  }
  if(action==='expenseBill'){
   const file=await expenseBills('file',session,{entry_id:data.entry_id});if(!file)throw Error('Bill not found or unavailable');
   const res=await drive(`/drive/v3/files/${encodeURIComponent(file.drive_id)}?alt=media&supportsAllDrives=true`),disposition=data.download===true?'attachment':'inline';
   return new Response(res.body,{headers:{...cors,'Content-Type':file.mime_type,'Content-Length':String(file.size_bytes||''),'Content-Disposition':`${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'X-Content-Type-Options':'nosniff'}});
  }
  if(action==='chatHistory')return json(await rpc('goa_server_chat_history',{p_session:session,p_peer:data.peer_id||null,p_before:data.before_id||null,p_limit:80}));
  if(action==='chatSend'){
   if(!await rpc('goa_server_rate',{p_key:await digest('chat-send:'+ctx.user_id),p_limit:120}))throw Error('You are sending messages too quickly. Please wait a moment.');
   const attachment=data.attachment&&typeof data.attachment==='object'?data.attachment:null;let uploaded:any=null;
   if(attachment){const mime=String(attachment.mime_type||''),name=String(attachment.name||'').replace(/[\x00-\x1f/\\]/g,'_').slice(0,180).trim(),raw=String(attachment.base64||'');if(!CHAT_MIME.has(mime))throw Error('This attachment type is not supported');if(!name)throw Error('Choose a file');if(raw.length>13981016)throw Error('Maximum attachment size is 10 MB');const bin=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));if(!bin.length||bin.length>10485760)throw Error('Maximum attachment size is 10 MB');const folder=await chatFolder(),boundary='goa_chat_'+crypto.randomUUID(),meta={name,mimeType:mime,parents:[folder],appProperties:{goa_trip:TRIP,goa_chat:'true',goa_uploader:ctx.user_id}};const multipart=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,bin,`\r\n--${boundary}--`]);uploaded=await(await drive('/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:multipart})).json()}
   let result;try{result=await rpc('goa_server_chat_send_attachment',{p_session:session,p_recipient:data.peer_id||null,p_body:String(data.text||''),p_client_id:String(data.client_id||''),p_drive_id:uploaded?.id||null,p_name:uploaded?.name||null,p_mime:uploaded?.mimeType||null,p_size:uploaded?Number(uploaded.size||0):null})}catch(error){if(uploaded?.id)await drive(`/drive/v3/files/${uploaded.id}?supportsAllDrives=true`,{method:'DELETE'}).catch(()=>{});throw error}
   if(!data.peer_id)await notifyTrip(session,'message','discussions');return json(result);
  }
  if(action==='chatDelete'){const result=await rpc('goa_server_chat_delete',{p_session:session,p_message:Number(data.id)});if(result.attachment_drive_id)await drive(`/drive/v3/files/${encodeURIComponent(result.attachment_drive_id)}?supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})}).catch(()=>{});return json(result)}
  if(action==='chatAttachment'){
   const file=await rpc('goa_server_chat_file',{p_session:session,p_message:Number(data.id)}),res=await drive(`/drive/v3/files/${encodeURIComponent(file.drive_id)}?alt=media&supportsAllDrives=true`),disposition=data.download===true?'attachment':'inline';
   return new Response(res.body,{headers:{...cors,'Content-Type':file.mime_type,'Content-Length':String(file.size_bytes||''),'Content-Disposition':`${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'X-Content-Type-Options':'nosniff'}});
  }
  if(action==='createInvite'){const token=random();await api(action,session,{label:data.label,token_hash:await digest(token)});return json({token})}
  if(action==='upload'){
   const bookingType=String(data.booking_type||''),bookingCategories:Record<string,string>={ticket:'travel/tickets',stay:'stay/confirmations',transport:'travel/transfers',activity:'itinerary/places',other:'documents/general'};const category=bookingCategories[bookingType];if(!category)throw Error('Choose a booking category');const folder=await categoryFolder(category);const mime=String(data.mime_type||'');if(!ALLOWED_MIME.has(mime))throw Error('This file type is not supported');
   const name=String(data.name||'').replace(/[\x00-\x1f/\\]/g,'_').slice(0,180).trim();if(!name)throw Error('Choose a file');
   const raw=String(data.base64||'');if(raw.length>13981016)throw Error('Maximum file size is 10 MB');const bin=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));if(!bin.length||bin.length>10485760)throw Error('Maximum file size is 10 MB');
   if(!await rpc('goa_server_rate',{p_key:await digest('upload:'+ctx.user_id),p_limit:30}))throw Error('Upload limit reached. Try again in 15 minutes.');
   const meta={name,mimeType:mime,parents:[folder],appProperties:{goa_trip:TRIP,goa_uploader:ctx.user_id,booking_type:bookingType,start_date:String(data.start_date||''),end_date:String(data.end_date||'')}};
   const boundary='goa_'+crypto.randomUUID();
   const multipart=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,bin,`\r\n--${boundary}--`]);
   const file=await(await drive('/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:multipart})).json();
   try{const result=await bookings('record',session,{drive_id:file.id,name:file.name,booking_type:bookingType,start_date:data.start_date||'',end_date:data.end_date||'',member_ids:data.member_ids,mime_type:file.mimeType,size_bytes:Number(file.size||bin.length)});return json(result)}
   catch(error){await drive(`/drive/v3/files/${file.id}?supportsAllDrives=true`,{method:'DELETE'}).catch(()=>{});throw error instanceof Error?error:Error('Could not save the booking. Please retry.')}
  }
  // File removal explicitly requested by the trip owner; use reversible Drive trash.
  if(action==='deleteFile'){
   const file=await bookings('file',session,{id:data.id});if(!file)throw Error('Booking not found or unavailable');
   if(ctx.role!=='admin'&&file.uploaded_by!==ctx.user_id)throw Error('Only the uploader or admin can remove this booking');
   await drive(`/drive/v3/files/${encodeURIComponent(file.drive_id)}?supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});
   try{await rpc('goa_server_forget_file',{p_session:session,p_id:data.id});return json({removed:true,trashed:true})}
   catch{await drive(`/drive/v3/files/${encodeURIComponent(file.drive_id)}?supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:false})}).catch(()=>{});throw Error('Could not remove the booking. Please retry.')}
  }
  if(action==='download'){
   const file=await bookings('file',session,{id:data.id});if(!file)throw Error('Booking not found or unavailable');
   const res=await drive(`/drive/v3/files/${encodeURIComponent(file.drive_id)}?alt=media&supportsAllDrives=true`);
   return new Response(res.body,{headers:{...cors,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'X-Content-Type-Options':'nosniff'}});
  }
  if(action==='delete'){
   const bill=await expenseBills('removeInfo',session,{entry_id:data.id}).catch((error:Error)=>{if(error.message.includes('Expense not found'))return null;throw error});
   if(bill?.drive_id)await drive(`/drive/v3/files/${encodeURIComponent(bill.drive_id)}?supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});
   try{const result=await api('delete',session,data);return json(result)}catch(error){if(bill?.drive_id)await drive(`/drive/v3/files/${encodeURIComponent(bill.drive_id)}?supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:false})}).catch(()=>{});throw error}
  }
  const actions=new Set(['saveTrip','add','update','delete','vote','listInvites','revokeInvite','listFiles']);if(!actions.has(action))throw Error('Unknown action');
  const result=await api(action,session,data);
  if(action==='saveTrip')await notifyTrip(session,'settings','overview');
  if(action==='add'){
   const kinds:Record<string,[string,string]>={message:['message','discussions'],itinerary:['plan','itinerary'],poll:['poll','polls'],expense:['expense','expenses'],checklist:['checklist','checklist'],link:['file','links']};
   const event=kinds[data.kind];if(event)await notifyTrip(session,event[0],event[1]);
  }
  return json(result);
 }catch(error){const message=error instanceof Error?error.message:'Request failed';const safe=message.includes('SUPABASE')||message.includes('GOOGLE_SERVICE_ACCOUNT_JSON')?'The storage connection needs administrator attention.':message;return json({error:safe},/sign in again|no longer have access/.test(message)?401:400)}
});

