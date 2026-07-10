const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const ore=+v.ore_production_mt||50000,sr=+v.strip_ratio||3;
  const obEx=+v.ob_excavation_cost||120,obTr=+v.ob_transport_cost||80;
  const oreEx=+v.ore_excavation_cost||180,db=+v.drill_blast_cost||60;
  const obVol=Math.round(ore*sr);
  const obCost=Math.round(obVol*(obEx+obTr));
  const oreCost=Math.round(ore*(oreEx));
  const dbCost=Math.round((obVol+ore)*db);
  const totalMonthly=obCost+oreCost+dbCost;
  const perMTOre=Math.round(totalMonthly/ore);
  return{
    rows:[
      ['OB Volume',sr+' BCM/MT × '+ore.toLocaleString('en-IN')+' MT',obVol.toLocaleString('en-IN')+' BCM'],
      ['OB Excavation',inr(obEx)+'/BCM',inr(Math.round(obVol*obEx))],
      ['OB Transport & Dumping',inr(obTr)+'/BCM',inr(Math.round(obVol*obTr))],
      ['Ore Excavation & Loading',inr(oreEx)+'/MT',inr(oreCost)],
      ['Drill & Blast (OB + Ore)',inr(db)+'/BCM',inr(dbCost)],
      ['Total Monthly Mining Cost','',inr(totalMonthly)]],
    k1:inr(perMTOre)+'/MT ore',k2:obVol.toLocaleString('en-IN')+' BCM',k3:inr(totalMonthly)};
}
