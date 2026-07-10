const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
export function compute(v){
  const stops=+v.stops||10,avgDist=+v.avg_distance||8,cpkm=+v.cost_per_km||30,stopTime=+v.avg_stop_time||15,speed=+v.speed||30,driverHr=+v.driver_cost_hr||150;
  const totalDist=Math.round((stops-1)*avgDist);
  const driveTimeHr=totalDist/speed;
  const stopTimeHr=stops*stopTime/60;
  const totalTimeHr=driveTimeHr+stopTimeHr;
  const vehicleCost=Math.round(totalDist*cpkm);
  const driverCost=Math.round(totalTimeHr*driverHr);
  const total=vehicleCost+driverCost;
  const costPerStop=Math.round(total/stops);
  const rows=[
   ['Delivery stops',stops,''],
   ['Total route distance',totalDist+' km',''],
   ['Drive time',Math.round(driveTimeHr*60)+' min',''],
   ['Stop time ('+stopTime+' min × '+stops+')','',Math.round(stopTimeHr*60)+' min'],
   ['Total route time','',Math.round(totalTimeHr*60)+' min ('+Math.round(totalTimeHr*10)/10+' hrs)'],
   ['Vehicle cost',inr(vehicleCost),''],
   ['Driver cost',inr(driverCost),''],
   ['Total route cost',inr(total),''],
   ['Cost per stop',inr(costPerStop),'']];
  return{rows,k1:inr(total),k2:totalDist+' km',k3:Math.round(totalTimeHr*60)+' min'};}
