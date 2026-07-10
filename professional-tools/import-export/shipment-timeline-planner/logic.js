const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const prod=+v.production_days||20,pack=+v.packing_days||3;
  const inland=+v.inland_transport_days||2,expClear=+v.export_clearance_days||2;
  const vessel=+v.vessel_booking_days||3,transit=+v.transit_days||18;
  const impClear=+v.import_clearance_days||5,localDel=+v.local_delivery_days||2;
  const preShip=prod+pack+inland+expClear+vessel;
  const portDoor=transit+impClear+localDel;
  const total=preShip+portDoor;
  const phases=[
    ['Production / Procurement',prod,prod],
    ['Packing & QC',pack,prod+pack],
    ['Inland Transport to Port',inland,prod+pack+inland],
    ['Export Customs Clearance',expClear,prod+pack+inland+expClear],
    ['Vessel Booking Buffer',vessel,preShip],
    ['Ocean / Air Transit',transit,preShip+transit],
    ['Import Customs',impClear,preShip+transit+impClear],
    ['Local Delivery',localDel,total]];
  return{
    rows:phases.map(p=>[p[0],p[1]+' days',p[2]+' days']),
    k1:total+' days',k2:portDoor+' days',k3:preShip+' days'};
}
