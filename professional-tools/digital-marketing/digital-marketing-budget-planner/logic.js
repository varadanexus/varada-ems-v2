const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const ALLOC={
brand:{startup:{paid:0.50,seo:0.15,social:0.20,content:0.08,email:0.04,tools:0.03},growth:{paid:0.40,seo:0.20,social:0.20,content:0.10,email:0.05,tools:0.05},mature:{paid:0.30,seo:0.25,social:0.20,content:0.15,email:0.06,tools:0.04}},
leads:{startup:{paid:0.55,seo:0.15,social:0.15,content:0.07,email:0.05,tools:0.03},growth:{paid:0.45,seo:0.20,social:0.15,content:0.10,email:0.06,tools:0.04},mature:{paid:0.35,seo:0.25,social:0.15,content:0.13,email:0.08,tools:0.04}},
ecom:{startup:{paid:0.50,seo:0.15,social:0.20,content:0.05,email:0.07,tools:0.03},growth:{paid:0.45,seo:0.18,social:0.18,content:0.07,email:0.08,tools:0.04},mature:{paid:0.38,seo:0.22,social:0.18,content:0.08,email:0.10,tools:0.04}},
retention:{startup:{paid:0.30,seo:0.15,social:0.20,content:0.10,email:0.20,tools:0.05},growth:{paid:0.25,seo:0.20,social:0.18,content:0.12,email:0.20,tools:0.05},mature:{paid:0.20,seo:0.22,social:0.18,content:0.14,email:0.20,tools:0.06}}};
const LABELS={paid:'Paid search & social ads',seo:'SEO & link building',social:'Organic social media',content:'Content creation & blog',email:'Email & automation',tools:'Analytics & tools'};
export function compute(v){
  const total=+v.total||100000,goal=v.goal||'leads',stage=v.stage||'growth';
  const alloc=(ALLOC[goal]||ALLOC.leads)[stage]||ALLOC.leads.growth;
  const rows=Object.entries(alloc).map(([k,p])=>[LABELS[k],Math.round(p*100)+'%',inr(Math.round(total*p))]);
  const paid=total*alloc.paid,seo=total*(alloc.seo+(alloc.content||0));
  return{rows,k1:inr(Math.round(paid)),k2:inr(Math.round(seo)),k3:inr(total)};}
