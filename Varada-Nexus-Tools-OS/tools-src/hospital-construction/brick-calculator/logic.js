export function compute(v){const a=+v.area||0,th=+v.thick||9,f=th===9?1:0.5,bricks=a*10*f,cem=a*0.02*f,sand=a*0.6*f;
 const rows=[['Bricks','',Math.round(bricks).toLocaleString('en-IN')+' nos'],['Cement (mortar)','',Math.ceil(cem)+' bags'],['Sand (mortar)','',Math.round(sand)+' cft']];
 return{rows,k1:Math.round(bricks).toLocaleString('en-IN')+' nos',k2:Math.ceil(cem)+' bags',k3:Math.round(sand)+' cft'};}
