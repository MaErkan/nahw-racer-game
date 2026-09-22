/*
 * Perspective projection and fixed-step motion adapted from
 * Jake Gordon's javascript-racer (MIT): https://github.com/jakesgordon/javascript-racer
 * Original source copyright (c) Jake Gordon. See THIRD_PARTY_LICENSES.md.
 * All rendered scenery and vehicle shapes below are original to this game.
 */
(function () {
  'use strict';
  const canvas = document.getElementById('race');
  const ctx = canvas.getContext('2d', { alpha: false });
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const interpolate = (a,b,t) => a+(b-a)*t;
  const accelerate = (v,a,dt) => v+a*dt;
  const project = (p,cameraX,cameraY,cameraZ,cameraDepth,width,height,roadWidth) => {
    p.camera = {x:(p.world.x||0)-cameraX,y:(p.world.y||0)-cameraY,z:(p.world.z||0)-cameraZ};
    p.screen = {scale:cameraDepth/p.camera.z};
    p.screen.x = Math.round(width/2+p.screen.scale*p.camera.x*width/2);
    p.screen.y = Math.round(height/2-p.screen.scale*p.camera.y*height/2);
    p.screen.w = Math.round(p.screen.scale*roadWidth*width/2);
    return p.screen;
  };
  let w=0,h=0,dpr=1,clock=0;
  const road={distance:0,speed:0,x:0,steer:0,driving:false,paused:true,boost:0,shake:0};
  const input={left:false,right:false,accelerate:false,brake:false};
  const traffic=[{z:250,lane:-.55,color:'#f59e63'},{z:580,lane:.56,color:'#d8e5e9'},{z:990,lane:-.13,color:'#19b7b0'},{z:1560,lane:.54,color:'#f7c957'},{z:2110,lane:-.55,color:'#f59e63'},{z:2680,lane:.06,color:'#d8e5e9'},{z:3240,lane:.54,color:'#19b7b0'},{z:3820,lane:-.45,color:'#f7c957'}];
  const particle=[];

  function resize(){dpr=Math.min(2,window.devicePixelRatio||1);w=window.innerWidth;h=window.innerHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize);resize();
  function poly(points,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fill();}
  function round(x,y,ww,hh,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,ww,hh,r);ctx.fill();}
  function curve(z){return Math.sin(z/510)*1.25+Math.sin(z/920)*.9;}
  function projection(z){const depth=1.75;const center=curve(road.distance+z*30)-curve(road.distance);return project({world:{x:center,y:0,z:depth+z*.42}},road.x*.85,1.55,-.12,1.05,w,h,3.2);}
  function sky(){
    let g=ctx.createLinearGradient(0,0,0,h*.66);g.addColorStop(0,'#0a1c30');g.addColorStop(.62,'#17425b');g.addColorStop(1,'#ed9e76');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const sunX=w*.72,sunY=h*.27,r=Math.max(36,w*.046);g=ctx.createRadialGradient(sunX,sunY,3,sunX,sunY,r*3);g.addColorStop(0,'#ffd99e70');g.addColorStop(1,'#ffd99e00');ctx.fillStyle=g;ctx.fillRect(sunX-r*3,sunY-r*3,r*6,r*6);ctx.fillStyle='#ffe4b2';ctx.beginPath();ctx.arc(sunX,sunY,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#1e4a58';ctx.beginPath();ctx.moveTo(0,h*.48);for(let x=0;x<=w;x+=12){ctx.lineTo(x,h*(.48+Math.sin(x*.006+road.distance*.00002)*.018));}ctx.lineTo(w,h*.62);ctx.lineTo(0,h*.62);ctx.fill();
    const base=h*.57,shift=(road.distance*.015)%130;
    for(let x=-130-shift;x<w+130;x+=63){const k=Math.floor(x/63+100),hgt=30+(k*17%65);ctx.fillStyle=k%3?'#19394a':'#244c5a';ctx.fillRect(x,base-hgt,41,hgt);ctx.fillStyle='#ffd69545';for(let yy=base-hgt+10;yy<base-4;yy+=15)for(let xx=x+7;xx<x+36;xx+=13)ctx.fillRect(xx,yy,3,5);}
    ctx.fillStyle='#aa7b56';ctx.fillRect(0,h*.57,w,h*.43);
  }
  function roadSlice(far,near,index){
    const shade=index%6<3;
    const sand=shade?'#bf9167':'#c69c74';
    poly([[0,far.y],[w,far.y],[w,near.y],[0,near.y]],sand);
    poly([[far.x-far.w*1.12,far.y],[far.x+far.w*1.12,far.y],[near.x+near.w*1.12,near.y],[near.x-near.w*1.12,near.y]],shade?'#d8c2a0':'#f1e0b8');
    poly([[far.x-far.w,far.y],[far.x+far.w,far.y],[near.x+near.w,near.y],[near.x-near.w,near.y]],shade?'#2c3542':'#303b49');
    for(const side of [-1,1]){
      poly([[far.x+side*far.w*.91,far.y],[far.x+side*far.w,far.y],[near.x+side*near.w,near.y],[near.x+side*near.w*.91,near.y]],shade?'#f8f0d8':'#923445');
    }
    if(index%8<4)for(const line of [-1/3,1/3])poly([[far.x+far.w*line-2,far.y],[far.x+far.w*line+2,far.y],[near.x+near.w*line+3,near.y],[near.x+near.w*line-3,near.y]],'#efd9a75e');
    if(index%12===0&&near.y>h*.48){for(const side of [-1,1]){const x=near.x+side*near.w*1.25;ctx.strokeStyle='#f8dfb4';ctx.lineWidth=Math.max(1,near.w*.008);ctx.beginPath();ctx.moveTo(x,near.y);ctx.lineTo(x,near.y-Math.max(8,near.w*.22));ctx.stroke();ctx.fillStyle='#ffe4a9';ctx.beginPath();ctx.arc(x,near.y-Math.max(8,near.w*.22),Math.max(2,near.w*.02),0,Math.PI*2);ctx.fill();}}
  }
  function carShape(cx,cy,scale,color,isPlayer=false){
    const ww=88*scale,hh=126*scale;
    ctx.save();ctx.translate(cx,cy);if(isPlayer)ctx.rotate(-road.steer*.055);
    ctx.fillStyle='#07142180';ctx.beginPath();ctx.ellipse(0,hh*.17,ww*.6,hh*.18,0,0,Math.PI*2);ctx.fill();
    round(-ww*.54,-hh*.37,ww*.18,hh*.68,ww*.04,'#111923');round(ww*.36,-hh*.37,ww*.18,hh*.68,ww*.04,'#111923');
    poly([[-ww*.38,-hh*.63],[ww*.38,-hh*.63],[ww*.51,hh*.42],[-ww*.51,hh*.42]],color);
    poly([[-ww*.31,-hh*.34],[ww*.31,-hh*.34],[ww*.37,hh*.08],[-ww*.37,hh*.08]],'#132b3dbb');
    poly([[-ww*.31,-hh*.34],[ww*.31,-hh*.34],[ww*.24,-hh*.5],[-ww*.24,-hh*.5]],'#9ed7dc');
    round(-ww*.37,hh*.27,ww*.74,hh*.07,4,'#e9e4d3');
    round(-ww*.38,hh*.38,ww*.23,hh*.08,3,'#e94254');round(ww*.15,hh*.38,ww*.23,hh*.08,3,'#e94254');
    if(isPlayer){poly([[-ww*.04,-hh*.55],[ww*.04,-hh*.55],[ww*.08,hh*.37],[-ww*.08,hh*.37]],'#fff2d3');}
    ctx.restore();
  }
  function drawTraffic(){for(const bot of traffic){const ahead=bot.z-road.distance;if(ahead<=0||ahead>1100)continue;const z=3+ahead/22,p=projection(z),size=clamp(p.w/210,.1,1.05);carShape(p.x+bot.lane*p.w*.66,p.y-18*size,size,bot.color);}}
  function arch(){const next=window.NahwGame?.nextGateDistance?.()??Infinity,dist=next-road.distance;if(dist<0||dist>700)return;const p=projection(3+dist/22),s=clamp(p.w/215,.16,1.9),y=p.y;ctx.lineWidth=16*s;ctx.strokeStyle='#e9d9b4';ctx.beginPath();ctx.moveTo(p.x-p.w*.89,y);ctx.lineTo(p.x-p.w*.89,y-145*s);ctx.lineTo(p.x+p.w*.89,y-145*s);ctx.lineTo(p.x+p.w*.89,y);ctx.stroke();round(p.x-p.w*.64,y-136*s,p.w*1.28,46*s,9*s,'#7b1b3c');ctx.fillStyle='#fff6dc';ctx.font=`bold ${Math.max(9,20*s)}px system-ui`;ctx.textAlign='center';ctx.fillText('بوابة السؤال',p.x,y-106*s);}
  function drawPlayer(){const base=Math.min(h*.83,h-90),size=clamp(w/1050,.75,1.25);carShape(w/2+road.x*w*.085,base,1.45*size,'#8b173b',true);if(road.boost>0){ctx.fillStyle='#f4c77199';for(let i=0;i<8;i++){const px=w/2+(Math.random()-.5)*80,py=base+70+Math.random()*95;poly([[px,py],[px+3,py],[px+10,py+20]],'#f7bf71bb');}}}
  function render(){ctx.save();if(road.shake>0)ctx.translate((Math.random()-.5)*road.shake*8,0);sky();let previous=projection(75);for(let i=74;i>=1;i--){const p=projection(i);if(previous.y<p.y)roadSlice(previous,p,i+Math.floor(road.distance/30));previous=p;}drawTraffic();arch();drawPlayer();ctx.restore();}
  function update(dt){clock+=dt;if(!road.driving||road.paused)return;const steer=(input.right?1:0)-(input.left?1:0);road.steer=interpolate(road.steer,steer,Math.min(1,dt*8));const targetAccel=input.accelerate?145:35;const slow=input.brake?-310:targetAccel;road.speed=clamp(accelerate(road.speed,slow-80*(road.speed/235),dt),0,road.boost>0?290:235);road.x=clamp(road.x+road.steer*dt*(1+road.speed/170)-curve(road.distance)*dt*.025,-2.3,2.3);if(Math.abs(road.x)>1.65)road.speed=Math.max(70,road.speed-dt*150);const before=road.distance;road.distance+=road.speed*dt;if(road.boost>0)road.boost-=dt;if(road.shake>0)road.shake=Math.max(0,road.shake-dt*3);for(const bot of traffic){if(before<bot.z&&road.distance>=bot.z-3&&Math.abs(road.x-bot.lane)<.34){road.speed*=.48;road.shake=1;window.NahwGame?.collision?.();}}window.NahwGame?.advance?.(before,road.distance);}
  let previousTime=performance.now(),accumulator=0;function loop(now){let dt=Math.min(.1,(now-previousTime)/1000);previousTime=now;accumulator+=dt;while(accumulator>=1/60){update(1/60);accumulator-=1/60;}render();requestAnimationFrame(loop);}requestAnimationFrame(loop);
  window.Racer={road,input,boost(){road.boost=2.7;road.speed=Math.max(road.speed,180);},reset(){road.distance=0;road.speed=0;road.x=0;road.driving=false;road.paused=true;road.boost=0;road.shake=0;},pause(){road.paused=true;road.speed=0;},resume(){road.paused=false;road.driving=true;},resize};
})();
