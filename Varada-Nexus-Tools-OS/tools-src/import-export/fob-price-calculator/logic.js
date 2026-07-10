const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const exw=+v.exw_unit||850,qty=+v.quantity||500;
  const pack=+v.packing_cost||12000,inland=+v.inland_transport||10000;
  const cha=+v.cha_charges||6500,port=+v.port_charges||5000,other=+v.other_charges||2000;
  const exwTotal=exw*qty;
  const addons=pack+inland+cha+port+other;
  const fobTotal=exwTotal+addons;
  const fobUnit=Math.round(fobTotal/qty);
  return{
    rows:[
      ['EXW (factory)',qty+' units @ ₹'+exw,inr(exwTotal)],
      ['Export Packing','',inr(pack)],
      ['Inland Transport','',inr(inland)],
      ['CHA / Shipping Bill','',inr(cha)],
      ['Port / THC Charges','',inr(port)],
      ['Other Charges','',inr(other)],
      ['FOB Total','',inr(fobTotal)]],
    k1:inr(fobUnit)+'/unit',k2:inr(fobTotal),k3:inr(addons)};
}
