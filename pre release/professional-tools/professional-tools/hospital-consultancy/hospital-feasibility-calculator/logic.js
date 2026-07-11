const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN')+' L';
export function compute(v){
  const b=+v.beds||100,ar=+v.arpob||8000,capex=+v.capex||10000,dbt=+v.debt||65,occ3=+v.occ3||70;
  const occs=[30,50,occ3,Math.min(occ3+8,85),Math.min(occ3+15,85)];
  const margins=[0.18,0.22,0.26,0.26,0.26];
  const annRev=yr=>b*occs[yr]/100*ar*365/100000;
  const rows=occs.map((o,i)=>[('Year '+(i+1)),o+'%',inr(Math.round(annRev(i)*10)/10)]);
  const y5rev=annRev(4);
  const equity=capex*(1-dbt/100);
  // simple IRR approximation: avg EBITDA / equity
  const avgEBITDA=occs.reduce((s,o,i)=>s+annRev(i)*margins[i],0)/5;
  const irr=Math.round(avgEBITDA/equity*100*10)/10;
  const payback=Math.round(equity/avgEBITDA*10)/10;
  rows.push(['Avg EBITDA/yr','',inr(Math.round(avgEBITDA*10)/10)]);
  return{rows,k1:inr(Math.round(y5rev*10)/10),k2:irr+'%',k3:payback+' yrs'};}
