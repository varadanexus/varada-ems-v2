let installPrompt=null,registration=null,busy=false;
const mount=document.querySelector('#app-setup');
if(mount)mount.hidden=true;
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const app=()=>window.GOA_APP;
const signedIn=()=>!!app()?.getMember();
let enabled=false;
let syncedSession=null;
async function syncExisting(){const session=app()?.getSession();if(!signedIn()||!registration||!session||syncedSession===session.access_token)return;const sub=await registration.pushManager?.getSubscription();if(sub&&'Notification'in window&&Notification.permission==='granted'){await app().api('pushSubscribe',{subscription:sub.toJSON(),app_url:new URL('./',location.href).href});syncedSession=session.access_token;enabled=true;render()}}
const iosHelp='On your iPhone or iPad, open this page in Safari. Tap Share, choose Add to Home Screen, and tap Add. Open Afterglow from that icon, sign in, then tap Enable notifications.';
function help(){app().openModal('Add Afterglow to your home screen',`<p class="modal-note">${isIOS()?iosHelp:'Open this page in Chrome or Edge. Use the browser menu and choose Install app or Add to Home Screen. If you opened the invitation inside a chat app, open it in your browser first.'}</p><p class="muted">Create your account from your invitation first. If the installed app asks you to sign in, use the same email or mobile number and password.</p><div class="form-actions"><button class="button" id="close-install-help">Got it</button></div>`);document.querySelector('#close-install-help').onclick=app().closeModal}
async function install(){if(installed())return app().toast('Afterglow is already on your home screen.');if(!installPrompt)return help();const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;render()}
async function ownWorker(){
 if(!registration)throw Error('App installation is not supported in this browser.');
 if(registration.active?.state==='activated')return registration;
 const worker=registration.installing||registration.waiting||registration.active;
 if(!worker)throw Error('The app is still preparing. Try again in a moment.');
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('The app is still preparing. Please try again.')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve()}else if(worker.state==='redundant'){clearTimeout(timeout);reject(Error('Refresh the app and try again.'))}})});return registration;
}
function keyBytes(key){const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function enable(){
 if(!signedIn())return app().toast('Join your crew or sign in before enabling notifications.');
 if(isIOS()&&!installed())return help();
 if(!('Notification'in window)||!('PushManager'in window)||!registration)return app().toast('This browser does not support trip notifications. Try Safari on an installed iPhone app, or Chrome on Android.');
 // Permission is requested directly from this button tap, before any network await.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')return app().toast(permission==='denied'?'Notifications are blocked. You can allow them in this site’s browser settings.':'Notifications can be enabled later.');
 const config=await app().api('pushConfig');if(!config.configured)throw Error('Notifications are not configured yet.');
 const reg=await ownWorker();const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
 await app().api('pushSubscribe',{subscription:sub.toJSON(),app_url:new URL('./',location.href).href});enabled=true;render();app().toast('Trip notifications enabled on this device.');
}
async function disconnect(){const reg=await ownWorker().catch(()=>null);const sub=await reg?.pushManager.getSubscription();if(sub){if(signedIn())await app().api('pushUnsubscribe',{endpoint:sub.endpoint}).catch(()=>{});await sub.unsubscribe()}enabled=false;render()}
async function action(fn){if(busy)return;busy=true;render();try{await fn()}catch(e){app()?.toast(e.message)}finally{busy=false;render()}}
function render(){
 if(!mount||!app())return;
 const isInstalled=installed();const supported='Notification'in window&&'PushManager'in window;
 mount.innerHTML=`<div class="panel app-setup-panel"><div><div class="eyebrow">YOUR TRIP, ONE TAP AWAY</div><h2>${isInstalled?'Your home-screen escape.':'Take your crew with you.'}</h2><p class="muted">${isInstalled?'Afterglow is running as an app.':'Add Afterglow to your home screen on iPhone or Android.'} ${signedIn()?'Enable instant updates for plans, messages, polls, bookings, expenses, and a daily trip countdown.':'Join using your invitation, then sign in to enable trip updates.'}</p><p class="note">${enabled?'Notifications and the daily countdown are on for this device.':isIOS()&&!isInstalled()?'On iPhone, add the app to your home screen before enabling notifications.':'Installation and notifications always need your approval.'}</p></div><div class="app-setup-actions">${!isInstalled?'<button class="button outline" id="install-app">＋ Add to Home Screen</button>':''}${signedIn()&&supported?`<button class="button ${enabled?'outline':''}" id="enable-push" ${busy?'disabled':''}>${enabled?'Turn off notifications':'Enable notifications'}</button>${enabled?'<button class="button light" id="test-push">Send me a test</button>':''}`:''}</div></div>`;
 document.querySelector('#install-app')?.addEventListener('click',()=>action(install));
 document.querySelector('#enable-push')?.addEventListener('click',()=>action(enabled?disconnect:enable));
 document.querySelector('#test-push')?.addEventListener('click',()=>action(async()=>{const result=await app().api('pushTest');app().toast(result.delivered?'Test sent. Check your device’s notifications.':result.subscribed?'Your push service did not accept the test. Try enabling notifications again.':'Enable notifications on this device first.')}));
 const top=document.querySelector('#install-top');if(top){top.hidden=isInstalled;top.onclick=()=>action(install)}
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;render()});
window.addEventListener('appinstalled',()=>{installPrompt=null;render();app()?.toast('Afterglow added to your home screen.')});
window.addEventListener('goa-state',()=>{render();syncExisting().catch(()=>{})});
window.addEventListener('online',()=>app()?.toast('Back online. Your trip is ready to sync.'));
window.addEventListener('offline',()=>app()?.toast('You’re offline. Connect to load your private trip details.'));
window.GOA_PWA={disconnect,enableNotifications:()=>action(enable)};
if('serviceWorker'in navigator&&isSecureContext){navigator.serviceWorker.register(new URL('sw.js',import.meta.url),{scope:'./',updateViaCache:'none'}).then(async reg=>{registration=reg;const sub=await reg.pushManager?.getSubscription();enabled=!!sub&&Notification.permission==='granted';await syncExisting().catch(()=>{});render()}).catch(()=>{registration=null;render()})}
render();

