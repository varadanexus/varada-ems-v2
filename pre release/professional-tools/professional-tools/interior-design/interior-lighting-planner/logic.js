const LUX={bedroom:150,living:200,kitchen:300,office:500,hospital:200,ot:1000};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const L=+v.length||15,W=+v.width||12,H=+v.height||10,fw=+v.fixture_w||12;
  const usage=v.usage||'living';
  const lux=LUX[usage]||200;
  const area=L*W;
  const lmPerW=90,uc=H>12?0.6:H>9?0.7:0.75;
  const totalLm=lux*area/uc;
  const perFixture=fw*lmPerW;
  const count=Math.ceil(totalLm/perFixture);
  const totalW=count*fw;
  const annualKwh=totalW/1000*8*300;
  const annualCost=annualKwh*8;
  const rows=[['Room area','',area+' sq ft'],['Required lumens','',Math.round(totalLm).toLocaleString('en-IN')+' lm'],['Lumens per fixture ('+fw+'W)','',Math.round(perFixture)+' lm'],['Fixtures needed','',count],['Total wattage','',totalW+' W'],['Annual electricity','8hr/day 300 days',inr(Math.round(annualCost))]];
  return{rows,k1:count+' fixtures',k2:totalW+' W',k3:inr(Math.round(annualCost))+'/yr'};}
