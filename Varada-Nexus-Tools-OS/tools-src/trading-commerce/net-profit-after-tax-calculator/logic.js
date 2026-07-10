const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const rev=+v.revenue||10000000,cogs=+v.cogs||7000000;
  const opex=+v.operating_expenses||1200000,dep=+v.depreciation||150000;
  const interest=+v.interest_expense||200000,et=v.entity_type||'company';
  const grossProfit=rev-cogs;
  const ebitda=grossProfit-opex;
  const ebit=ebitda-dep;
  const pbt=ebit-interest;
  const taxRates={proprietor:0.30,firm:0.312,company:0.2600,company_concessional:0.2288};
  const taxR=taxRates[et]||0.26;
  const tax=Math.max(0,Math.round(pbt*taxR));
  const pat=pbt-tax;
  const effR=pbt>0?Math.round(tax/pbt*1000)/10:0;
  const pbtPct=Math.round(pbt/rev*1000)/10;
  const labelMap={proprietor:'Individual (30%)',firm:'Firm/LLP (31.2%)',company:'Company (26% incl cess)',company_concessional:'Company conc. (22.88%)'};
  return{
    rows:[
      ['Revenue','',inr(rev)],
      ['Cost of Goods Sold','',inr(cogs)],
      ['Gross Profit','',inr(grossProfit)],
      ['Operating Expenses','',inr(opex)],
      ['EBITDA','',inr(ebitda)],
      ['Depreciation','',inr(dep)],
      ['Interest Expense','',inr(interest)],
      ['PBT','',inr(pbt)],
      ['Tax',labelMap[et]||et,inr(tax)],
      ['Net Profit (PAT)','',inr(pat)]],
    k1:inr(pat),k2:effR+'%',k3:pbtPct+'%'};
}
