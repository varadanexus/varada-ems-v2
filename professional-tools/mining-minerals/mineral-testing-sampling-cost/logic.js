const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const samples=+v.samples_per_month||100;
  const collect=+v.collection_cost_per_sample||300;
  const prep=+v.preparation_cost_per_sample||200;
  const assay=+v.assay_cost_per_sample||800;
  const moistPct=+v.moisture_test_pct||20;
  const moistCost=+v.moisture_cost||200;
  const reporting=+v.reporting_monthly||15000;
  const moistSamples=Math.round(samples*moistPct/100);
  const collTotal=collect*samples;
  const prepTotal=prep*samples;
  const assayTotal=assay*samples;
  const moistTotal=moistSamples*moistCost;
  const totalMonthly=collTotal+prepTotal+assayTotal+moistTotal+reporting;
  const perSample=Math.round(totalMonthly/samples);
  return{
    rows:[
      ['Sample Collection',samples+' × ₹'+collect,inr(collTotal)],
      ['Sample Preparation',samples+' × ₹'+prep,inr(prepTotal)],
      ['Laboratory Assay',samples+' × ₹'+assay,inr(assayTotal)],
      ['Moisture Testing',moistSamples+' × ₹'+moistCost,inr(moistTotal)],
      ['Reporting & Certification','Monthly',inr(reporting)],
      ['Total Monthly Cost','',inr(totalMonthly)]],
    k1:inr(totalMonthly),k2:inr(perSample)+'/sample',k3:inr(totalMonthly*12)};
}
