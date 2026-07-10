const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const THC={
  jnpt:{t20:6250,t40:9375,t40hc:10500},
  chennai:{t20:5600,t40:8400,t40hc:9400},
  mundra:{t20:5900,t40:8900,t40hc:9900},
  kolkata:{t20:5750,t40:8600,t40hc:9600}};
const DEMURRAGE=4000;
export function compute(v){
  const ct=v.container_type||'20ft',port=v.port||'jnpt';
  const dir=v.direction||'export',extraDays=+v.extra_days||0,lcl=+v.lcl_cbm||0;
  const rates=THC[port]||THC.jnpt;
  const thcKey=ct==='40hc'?'t40hc':ct==='40ft'?'t40':'t20';
  const thc=lcl>0?0:rates[thcKey];
  const lclCharge=Math.round(lcl*650);
  const scanning=1200,blFee=2500;
  const demurrage=Math.round(extraDays*DEMURRAGE);
  const total=thc+lclCharge+scanning+blFee+demurrage;
  return{
    rows:[
      ['THC / Terminal Handling',ct+(lcl>0?' (FCL N/A — LCL)':''),inr(thc)],
      ['LCL Handling',lcl>0?lcl+' CBM × ₹650':'N/A (FCL)',inr(lclCharge)],
      ['Container Scanning','Flat',inr(scanning)],
      ['BL / Shipping Bill Fee','Flat',inr(blFee)],
      ['Demurrage / Detention',extraDays+' day(s) × ₹'+DEMURRAGE,inr(demurrage)],
      ['Total Port Charges','',inr(total)]],
    k1:inr(total),k2:inr(demurrage),k3:inr(DEMURRAGE)+'/day'};
}
