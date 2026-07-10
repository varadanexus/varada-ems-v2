const HOURS={blog:4,ig:1.5,linkedin:1,fb:1,email:3,video:5};
export function compute(v){
  const w=4.3;
  const channels=[
   ['Blog',+v.blog_freq||0,HOURS.blog,1],
   ['Instagram',+(v.ig_freq||0)*w,HOURS.ig,+v.ig_freq||0],
   ['LinkedIn',+(v.linkedin_freq||0)*w,HOURS.linkedin,+v.linkedin_freq||0],
   ['Facebook',+(v.fb_freq||0)*w,HOURS.fb,+v.fb_freq||0],
   ['Email newsletter',+v.email_freq||0,HOURS.email,1],
   ['YouTube / Reels',+v.video_freq||0,HOURS.video,1]];
  const rows=channels.filter(c=>c[1]>0).map(([n,pm,h])=>[n,Math.round(pm)+'/month',Math.round(Math.round(pm)*h)+' hrs']);
  const total=channels.reduce((s,c)=>s+Math.round(c[1]),0);
  const totalHrs=channels.reduce((s,c)=>s+Math.round(c[1])*c[2],0);
  const perWeek=channels.reduce((s,c)=>s+c[3],0);
  return{rows,k1:total+' pieces',k2:Math.round(totalHrs)+' hours',k3:Math.round(perWeek)+'/week'};}
