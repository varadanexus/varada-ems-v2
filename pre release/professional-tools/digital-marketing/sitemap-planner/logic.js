export function compute(v){
  const home=+v.home_pages||10,blog=+v.blog_pages||50,product=+v.product_pages||20,loc=+v.location_pages||5,other=+v.other_pages||8;
  const total=home+blog+product+loc+other;
  const highPrio=home+product+loc;
  const rows=[
   ['Homepage & core services',home+' URLs','Priority: 0.9–1.0','Weekly'],
   ['Blog / articles',blog+' URLs','Priority: 0.7','Weekly'],
   ['Product / service pages',product+' URLs','Priority: 0.8','Monthly'],
   ['Location pages',loc+' URLs','Priority: 0.7','Monthly'],
   ['Other (about, contact)',other+' URLs','Priority: 0.5','Yearly'],
   ['Total',total+' URLs','','']];
  const kb=Math.round(total*1.2);
  return{rows:rows.map(r=>[r[0],r[1],r[2]]),k1:total+' URLs',k2:highPrio+' high-priority URLs',k3:'~'+kb+' KB'};}
