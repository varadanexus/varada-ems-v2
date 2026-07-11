const bags=kg=>{const b=kg/50; return (Math.round(b*10)/10)+' bags ('+Math.round(kg)+' kg)';};
export function compute(v){
  const a=+v.area||0, N=(+v.n||0)*a, P=(+v.p||0)*a, K=(+v.k||0)*a;
  const dap=P/0.46, nFromDap=dap*0.18, urea=Math.max(0,(N-nFromDap))/0.46, mop=K/0.60;
  const rows=[['DAP','P₂O₅ 46% + N 18%',bags(dap)],['Urea','N 46% (after DAP N)',bags(urea)],['MOP','K₂O 60%',bags(mop)]];
  return {rows,k1:bags(urea),k2:bags(dap),k3:bags(mop)};
}
