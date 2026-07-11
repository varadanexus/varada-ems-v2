const PLANS={
'1bhk':{rooms:[['Living room','Sofa, TV unit, coffee table'],['Bedroom (1)','Bed, wardrobe, study table'],['Dining','Table + 4 chairs']],mult:[1.0,1.0,0.6]},
'2bhk':{rooms:[['Living room','Sofa set, TV unit, coffee table'],['Master bedroom','Bed, wardrobe'],['Bedroom 2','Bed, wardrobe'],['Dining','Table + 6 chairs']],mult:[1.0,1.0,0.8,0.7]},
'3bhk':{rooms:[['Living room','Sofa, TV unit, center table'],['Master bedroom','Bed, wardrobe, dresser'],['Bedroom 2','Bed, wardrobe'],['Bedroom 3','Bed, wardrobe'],['Dining','Table + 8 chairs'],['Pooja / study','Shelving, chair']],mult:[1.2,1.0,0.8,0.7,0.8,0.3]},
'villa':{rooms:[['Living room','Premium sofa, entertainment unit'],['Master bedroom','King bed, walk-in wardrobe'],['Bedroom 2-3 (each)','Beds, wardrobes'],['Bedroom 4','Bed, wardrobe'],['Dining','Table + 10 chairs'],['Study / library','Desk, bookshelf'],['Staff quarters','Basic']],mult:[2.0,1.5,1.2,1.0,1.2,0.8,0.3]},
'office_sm':{rooms:[['Director cabin','Exec desk, chair, meeting'],['Workstations (15)','Desks, chairs, pedestals'],['Meeting room','Table + 8 chairs'],['Reception','Desk, seating']],mult:[1.2,3.0,0.8,0.6]},
'office_lg':{rooms:[['Director + GM cabins','Executive furniture'],['Workstations (50+)','Desks, chairs'],['Board room','Premium table + chairs'],['Meeting rooms (3)','Tables + chairs'],['Reception / lobby','Designer furniture'],['Cafeteria','Tables, chairs']],mult:[2.5,8.0,2.0,1.5,1.5,1.0]}};
const BASE={budget:30000,standard:60000,premium:120000,luxury:250000};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const cfg=v.bhk||'3bhk',tier=v.tier||'standard';
  const P=PLANS[cfg]||PLANS['3bhk'];
  const base=BASE[tier]||60000;
  const items=P.rooms.map(([rm,desc],i)=>[rm,desc,inr(Math.round(base*P.mult[i]))]);
  const total=P.mult.reduce((s,m)=>s+base*m,0);
  return{rows:items,k1:inr(Math.round(total)),k2:inr(Math.round(base*P.mult[0])),k3:inr(Math.round(total/P.rooms.length))};}
