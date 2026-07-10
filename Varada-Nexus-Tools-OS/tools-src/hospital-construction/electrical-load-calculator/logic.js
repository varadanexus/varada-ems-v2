const STD=[100,160,250,315,400,500,630,800,1000,1250,1600,2000,2500];
export function compute(v){const a=+v.area||0,va=+v.va||5,d=+v.div||70,connected=a*va/1000,demand=connected*d/100,need=demand/0.8;
 const tr=STD.find(s=>s>=need)||Math.ceil(need);
 const rows=[['Connected load','@ '+va+' VA/sqft',(Math.round(connected))+' kVA'],['Maximum demand','@ '+d+'% diversity',(Math.round(demand))+' kVA'],['Suggested transformer','80% loading',tr+' kVA']];
 return{rows,k1:Math.round(demand)+' kVA',k2:Math.round(connected)+' kVA',k3:tr+' kVA'};}
