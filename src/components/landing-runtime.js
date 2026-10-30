"use client";
import { useEffect } from "react";
import * as THREE from "three";

/**
 * Imperative runtime for the landing page: the Three.js network, the scroll-scrubbed
 * lifecycle, reveals, the live terminal and copy buttons. Everything it starts is torn
 * down on unmount so client-side navigation to the dashboard leaves nothing running.
 */
export function LandingRuntime() {
  useEffect(() => {
    /** @type {ReturnType<typeof setInterval>[]} */
    const timers = [];
    /** @type {Array<[string, EventListener, AddEventListenerOptions | undefined]>} */
    const listeners = [];
    let stopped = false;
    const ctx = {
      $: (s) => document.querySelector(s),
      iv: (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; },
      on: (type, fn, opts) => { window.addEventListener(type, fn, opts); listeners.push([type, fn, opts]); },
      isStopped: () => stopped,
    };
    try {
      run(ctx);
    } catch (err) {
      console.error("landing runtime failed", err);
    }
    return () => {
      stopped = true;
      timers.forEach(clearInterval);
      listeners.forEach(([t, f, o]) => window.removeEventListener(t, f, o));
    };
  }, []);
  return null;
}

/**
 * @param {{ $: (s: string) => any, iv: (fn: () => void, ms: number) => unknown, on: (type: string, fn: any, opts?: AddEventListenerOptions) => void, isStopped: () => boolean }} ctx
 */
function run(ctx) {
  const { $, iv, on } = ctx;
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
let scrollP=0;

/* ---------- 3D hero ---------- */
(function(){
    const cv=$("#gl");const r=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});r.setPixelRatio(Math.min(devicePixelRatio,2));
  const sc=new THREE.Scene();sc.fog=new THREE.FogExp2(0xf5f6f4,0.05);
  const cam=new THREE.PerspectiveCamera(42,1,0.1,100);cam.position.set(0,1.2,16);
  const root=new THREE.Group();root.position.x=4.2;sc.add(root);
  const INK=new THREE.Color(0x0f1113),ACC=new THREE.Color(0x1f3cff),BAD=new THREE.Color(0xd7263d),OK=new THREE.Color(0x13864f),WARN=new THREE.Color(0xc76a00);
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(0.95,2),new THREE.MeshBasicMaterial({color:INK,wireframe:true,transparent:true,opacity:.8}));root.add(core);
  const coreIn=new THREE.Mesh(new THREE.IcosahedronGeometry(0.5,1),new THREE.MeshBasicMaterial({color:ACC}));root.add(coreIn);
  const N=26,nodes=[],curves=[];const lineMat=new THREE.LineBasicMaterial({color:0x0f1113,transparent:true,opacity:.16});
  for(let i=0;i<N;i++){
    const phi=Math.acos(1-2*(i+.5)/N),th=Math.PI*(1+Math.sqrt(5))*i;const R=5.2+Math.random()*2.2;
    const p=new THREE.Vector3(R*Math.sin(phi)*Math.cos(th),R*Math.cos(phi)*0.65,R*Math.sin(phi)*Math.sin(th));
    const dead=i===7||i===18;
    const m=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshBasicMaterial({color:dead?BAD:INK,transparent:true,opacity:dead?.95:.85}));
    m.position.copy(p);m.scale.setScalar(0.001);root.add(m);nodes.push({m,dead,p,born:400+i*45});
    const mid=p.clone().multiplyScalar(.5).add(new THREE.Vector3((Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2));
    const c=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,0,0),mid,p);curves.push(c);
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(40)),lineMat));
  }
  const P=70,pg=new THREE.BufferGeometry(),pos=new Float32Array(P*3),col=new Float32Array(P*3);
  const pk=[];for(let i=0;i<P;i++)pk.push({c:Math.floor(Math.random()*N),t:Math.random(),sp:.004+Math.random()*.006,back:false});
  pg.setAttribute("position",new THREE.BufferAttribute(pos,3));pg.setAttribute("color",new THREE.BufferAttribute(col,3));
  root.add(new THREE.Points(pg,new THREE.PointsMaterial({size:.17,vertexColors:true,sizeAttenuation:true})));
  const D=400,dg=new THREE.BufferGeometry(),dp=new Float32Array(D*3);for(let i=0;i<D*3;i++)dp[i]=(Math.random()-.5)*34;
  dg.setAttribute("position",new THREE.BufferAttribute(dp,3));root.add(new THREE.Points(dg,new THREE.PointsMaterial({color:0x9aa1a8,size:.05,transparent:true,opacity:.6})));
  let mx=0,my=0,tx=0,ty=0;on("pointermove",e=>{tx=(e.clientX/innerWidth-.5);ty=(e.clientY/innerHeight-.5)});
  function size(){const w=cv.clientWidth,h=cv.clientHeight;r.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
  new ResizeObserver(size).observe(cv);size();
  const tmp=new THREE.Vector3();let t0=0,start=0;
  function frame(t){
    if(!start)start=t;const age=t-start;const dt=Math.min((t-t0)/16.7,3);t0=t;mx+=(tx-mx)*.04;my+=(ty-my)*.04;
    // intro: core grows, nodes pop in
    const intro=Math.min(1,age/900);const ei=1-Math.pow(1-intro,3);
    const hv=Math.min(1,scrollY/Math.max(1,cv.clientHeight));
    root.rotation.y+=0.0012*dt+mx*0.002;root.rotation.x=my*0.25+hv*0.5;
    cam.position.z=16+hv*6;root.position.y=-hv*2;
    core.rotation.x+=.004*dt;core.rotation.y+=.006*dt;coreIn.rotation.y-=.01*dt;core.scale.setScalar(ei*(1+Math.sin(t*.002)*.04));coreIn.scale.setScalar(ei);
    nodes.forEach((n,i)=>{const a=Math.min(1,Math.max(0,(age-n.born)/500));const s=1-Math.pow(1-a,3);n.m.scale.setScalar(Math.max(.001,s));n.m.rotation.y+=.01*dt;n.m.rotation.x+=.006*dt;if(n.dead)n.m.material.opacity=.55+Math.sin(t*.006+i)*.4});
    for(let i=0;i<P;i++){const k=pk[i];const c=curves[k.c];const dead=nodes[k.c].dead;
      if(!k.back){k.t+=k.sp*dt;if(k.t>=1){if(dead){k.back=true;k.t=1}else{k.t=0;k.c=Math.floor(Math.random()*N)}}}
      else{k.t-=k.sp*1.6*dt;if(k.t<=0){k.back=false;k.t=0;k.c=Math.floor(Math.random()*N)}}
      c.getPoint(k.t*ei,tmp);pos[i*3]=tmp.x;pos[i*3+1]=tmp.y;pos[i*3+2]=tmp.z;
      const cc=k.back?BAD:(dead&&k.t>.85?WARN:(k.t>.9?OK:ACC));col[i*3]=cc.r;col[i*3+1]=cc.g;col[i*3+2]=cc.b}
    pg.attributes.position.needsUpdate=true;pg.attributes.color.needsUpdate=true;
    r.render(sc,cam);if(!reduce||t<3000)if(!ctx.isStopped())requestAnimationFrame(frame);
  }
  if(!ctx.isStopped())requestAnimationFrame(frame);
})();

/* hero text parallax */
(function(){const ht=$("#herotext"),tm=$("#term");on("scroll",()=>{const y=scrollY;if(y<1200){ht.style.transform=`translateY(${y*.12}px)`;ht.style.opacity=String(1-y/900);tm.style.transform=`translateY(${y*.05}px)`}},{passive:true})})();

/* ---------- hero terminal ---------- */
const HOSTS=["api.acme.com","billing.acme.com","partners.shipfast.io","hooks.slack.com","analytics.acme.com","crm.internal"];
const TYPES=["order.paid","order.created","refund.issued","invoice.finalized","shipment.dispatched","customer.updated"];
const tl=$("#tl");
function line(){
  const h=HOSTS[Math.floor(Math.random()*HOSTS.length)];let code=200,ms=60+Math.floor(Math.random()*220);
  if(h==="partners.shipfast.io"){code=Math.random()<.7?503:200;if(code===503)ms=8000}else if(Math.random()<.03)code=500;
  const el=document.createElement("div");el.className="l";
  el.innerHTML=`<span class="t">${new Date().toTimeString().slice(0,8)}</span><span class="c ${code===200?"ok":code===503?"w":"bad"}">${code}</span><span class="e">${h} ← ${TYPES[Math.floor(Math.random()*TYPES.length)]}${code!==200?" · retry in "+["5s","30s","2m"][Math.floor(Math.random()*3)]:""}</span><span class="ms">${ms}ms</span>`;
  tl.appendChild(el);while(tl.children.length>8)tl.firstChild.remove();
}
for(let i=0;i<8;i++)line();iv(line,reduce?3000:900);

/* ---------- pinned lifecycle ---------- */
(function(){
  const life=$("#how"),logRows=[...document.querySelectorAll("#loglist li")],pk=$("#pk"),rail=$("#railfill"),rbox=$("#rbox"),rcode=$("#rcode"),pill=$("#pill"),pillt=$("#pillt"),shelf=$("#shelf"),parked=$("#parked"),lt=$("#lt"),ls=$("#ls"),foot=$("#lfoot"),ph=[...$("#phase").children],att=$("#att");
  const X0=120,X1=1080,SH=330;
  const STEPS=[["Your app sends one event.","POST /v1/events with an idempotency key. Tether stores it once and fans it out to every endpoint subscribed to that type."],
   ["The receiver is down. Tether turns around.","503. The attempt is recorded with status, latency and body. The next one is scheduled with jittered backoff and the worker moves on. Nothing blocks."],
   ["Backoff, then try again. And again.","5 s, 30 s, 2 min, 10 min, 1 h, 6 h, 24 h, each with ±20% jitter so a thousand failures never retry in the same second."],
   ["Seven failures. Parked, not lost.","Dead-lettered deliveries keep their payload, every attempt and every response body until you replay or discard them."],
   ["Receiver is back. Replay, and it lands.","One click or one command sends it again as a normal signed request with Tether-Attempt set. 200 OK."]];
  const SCHED=["0","+5 s","+30 s","+2 m","+10 m","+1 h","+6 h"];
  att.innerHTML=SCHED.map((s,i)=>{const x=X0+(X1-X0)*(i/6);return `<g id="a${i}" opacity=".35"><line x1="${x}" y1="236" x2="${x}" y2="248" stroke="#b9bec0"/><text x="${x}" y="266" text-anchor="middle" class="tiny">${s}</text><text x="${x}" y="284" text-anchor="middle" class="tiny" id="ac${i}"> </text></g>`}).join("");
  let cur=-1;
  function tlf(p){const seg=(a,b,x0,x1)=>x0+(x1-x0)*Math.min(1,Math.max(0,(p-a)/(b-a)));
    let x,y=200,down=false,rt=null,parkedNow=false,attempt=1,step=0,fail=false,ok=false;
    const bounces=[[.14,.22,1],[.22,.30,2],[.30,.38,3],[.38,.46,4],[.46,.54,5],[.54,.62,6]];
    if(p<.14){x=seg(0,.14,X0,X1);attempt=1;if(p>.12){down=true;fail=true}}
    else{let hit=false;for(const [a,b,n] of bounces){if(p<b){const f=(p-a)/(b-a);x=f<.5?X1-(X1-X0)*.45*(f*2):X1-(X1-X0)*.45*(1-(f-.5)*2);down=true;attempt=n+1;rt="retry in "+SCHED[n].replace("+","");fail=f>.95;step=n===1?1:2;hit=true;break}}
      if(!hit){if(p<.74){x=seg(.62,.74,X1,X0);y=seg(.62,.74,200,SH);down=true;attempt=7;step=3;rt=p<.68?"attempt 7 · 503":null}
        else if(p<.82){x=X0+60;y=SH;parkedNow=true;down=p<.78;step=3;attempt=7}
        else{x=seg(.82,1,X0+60,X1);y=seg(.82,.9,SH,200);attempt=8;step=4;ok=p>.98}}}
    return {x,y,down,rt,parkedNow,attempt,step,fail,ok};}
  function place(){
    const r=life.getBoundingClientRect();const p=Math.min(1,Math.max(0,-r.top/(r.height-innerHeight)));const t=tlf(p);
    pk.setAttribute("transform",`translate(${t.x} ${t.y})`);pk.firstElementChild.setAttribute("fill",t.ok?"#13864f":(t.fail||t.parkedNow?"#d7263d":"#1f3cff"));pk.firstElementChild.setAttribute("opacity",t.parkedNow?"0":"1");
    rail.setAttribute("x2",String(Math.max(X0,Math.min(X1,t.x))));
    rbox.setAttribute("stroke",t.down?"#d7263d":"#0f1113");rbox.setAttribute("fill",t.down?"#fff3f4":"#fff");
    rcode.textContent=t.down?"503 · timeout 8 000 ms":"200 OK · 142 ms";rcode.setAttribute("fill",t.down?"#d7263d":"#858d95");
    pill.setAttribute("opacity",t.rt?"1":"0");if(t.rt)pillt.textContent=t.rt;
    shelf.setAttribute("opacity",t.step>=3?"1":"0");parked.setAttribute("opacity",t.parkedNow?"1":"0");
    for(let i=0;i<7;i++){const g=document.getElementById("a"+i),c=document.getElementById("ac"+i);const done=i<t.attempt-1;g.setAttribute("opacity",done||i===t.attempt-1?"1":".35");c.textContent=done?"503":(i===t.attempt-1&&t.ok?"200":(i===t.attempt-1?"…":" "));c.setAttribute("fill",done?"#d7263d":t.ok?"#13864f":"#858d95")}
    foot.textContent=t.ok?"attempt 8 · delivered · 200 OK":t.parkedNow?"dead-letter queue · 1 · replay available":`attempt ${Math.min(t.attempt,7)} of 7 · ${t.rt?t.rt:t.down?"503":"in flight"}`;
    for(const li of logRows){const n=+li.dataset.n;const em=li.querySelector("em");let state="";
      if(n<=7){ if(n<t.attempt) state="fail"; else if(n===t.attempt) state=t.ok?"ok":(t.down&&!t.rt?"fail":"live"); }
      else { state=t.parkedNow?"live":(t.step>=4?"fail":""); }
      li.className=(state?state:"")+(n===8?" dlq":"");
      em.textContent=state==="fail"?(n===8?"replayed":"503"):state==="ok"?"200 OK":state==="live"?(n===8?"parked":(t.rt||"in flight")):"";}
    if(t.step!==cur){cur=t.step;lt.textContent=STEPS[cur][0];ls.textContent=STEPS[cur][1];ph.forEach((e,i)=>e.classList.toggle("on",i<=cur))}
  }
  on("scroll",place,{passive:true});on("resize",place);place();
})();

/* ---------- reveals ---------- */
(function(){
  const rv=[...document.querySelectorAll(".rv")];
  if(reduce||!("IntersectionObserver" in window))return;
  rv.forEach(e=>{if(e.getBoundingClientRect().top>innerHeight*.9)e.classList.add("pre")});
  const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.remove("pre");io.unobserve(x.target)}}),{threshold:.15});
  rv.forEach(e=>io.observe(e));
  const code=$("#code");code.classList.add("pre");[...code.querySelectorAll(".ln")].forEach((l,i)=>l.style.transitionDelay=(i*60)+"ms");
  new IntersectionObserver((es,o)=>es.forEach(x=>{if(x.isIntersecting){code.classList.remove("pre");o.unobserve(code)}}),{threshold:.3}).observe(code);
  const stats=[...document.querySelectorAll(".stat")];stats.forEach((s,i)=>s.querySelector(".v span").style.transitionDelay=(i*90)+"ms");
  new IntersectionObserver((es,o)=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.remove("pre");o.unobserve(x.target)}}),{threshold:.4}).observe(stats[0].parentElement);
  stats[0].parentElement.addEventListener("transitionend",()=>{});
  new IntersectionObserver((es,o)=>es.forEach(x=>{if(x.isIntersecting){stats.forEach(s=>s.classList.remove("pre"));o.disconnect()}}),{threshold:.3}).observe(stats[0]);
})();

/* ---------- nav highlight + progress ---------- */
(function(){
  const links=[...document.querySelectorAll("#topnav a")];const secs=links.map(a=>document.querySelector(a.getAttribute("href")));
  const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){links.forEach(l=>l.classList.toggle("on",l.getAttribute("href")==="#"+x.target.id))}}),{rootMargin:"-40% 0px -55% 0px"});
  secs.forEach(s=>s&&io.observe(s));
  const pr=$("#prog");on("scroll",()=>{const h=document.documentElement;pr.style.width=(scrollY/(h.scrollHeight-innerHeight)*100)+"%"},{passive:true});
})();

/* ---------- dashboard preview ---------- */
(function(){
  const W=640,H=170,pl=30,pb=20,n=24,gw=(W-pl-6)/n,max=1400;
  const base=[610,540,480,430,410,420,520,760,980,1120,1180,1210,1160,1240,1290,1310,1270,1190,1080,990,900,820,740,690];
  let s="";[0,700,1400].forEach(y=>{const yy=H-pb-(y/max)*(H-pb-8);s+=`<line x1="${pl}" x2="${W-4}" y1="${yy}" y2="${yy}" stroke="#e4e6e2"/><text x="${pl-6}" y="${yy+4}" text-anchor="end" font-size="9" font-family="Geist Mono,monospace" fill="#858d95">${y>=1000?(y/1000).toFixed(1)+"k":y}</text>`});
  base.forEach((b,i)=>{const x=pl+i*gw+2,w=gw-4,hs=(b/max)*(H-pb-8);const f=(i>=15&&i<=18)?b*.11:b*.012,hf=(f/max)*(H-pb-8);
    s+=`<rect class="b" style="--s:0;transition-delay:${i*30}ms" x="${x}" y="${H-pb-hs}" width="${w}" height="${hs}" fill="#0f1113" opacity="${i===23?1:.85}"/><rect class="b" style="--s:0;transition-delay:${i*30}ms" x="${x}" y="${H-pb-hs-hf}" width="${w}" height="${hf}" fill="#d7263d"/>`;
    if(i%4===0)s+=`<text x="${x+w/2}" y="${H-5}" text-anchor="middle" font-size="9" font-family="Geist Mono,monospace" fill="#858d95">${String((i+10)%24).padStart(2,"0")}:00</text>`});
  const hist=$("#hist");hist.innerHTML=s;
  new IntersectionObserver((es,o)=>es.forEach(x=>{if(x.isIntersecting){hist.querySelectorAll("rect.b").forEach(r=>r.style.setProperty("--s","1"));o.disconnect()}}),{threshold:.4}).observe(hist);
  const dl=$("#dlist");function row(){const h=HOSTS[Math.floor(Math.random()*HOSTS.length)];const code=h==="partners.shipfast.io"?503:200;const el=document.createElement("div");el.innerHTML=`<span class="t">${new Date().toTimeString().slice(0,8)}</span><span style="color:${code===200?"var(--ok)":"var(--warn)"}">${code}</span><span>${h.split(".")[0]} · ${TYPES[Math.floor(Math.random()*TYPES.length)]}</span><span class="ms">${code===200?60+Math.floor(Math.random()*200):8000}ms</span>`;dl.prepend(el);while(dl.children.length>9)dl.lastChild.remove()}
  for(let i=0;i<9;i++)row();iv(row,reduce?3000:1300);
})();

/* ---------- copy ---------- */
let tt;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("show"),1800)}
const COPY={verify:`import { verify } from "@tether/node";\n\nexport async function POST(req: Request) {\n  const event = await verify(req, process.env.TETHER_SECRET);\n  if (event.type === "order.paid") await fulfil(event.data.order_id);\n  return new Response(null, { status: 200 });\n}`,cmd:"git clone github.com/Priyansh10ff/tether && docker compose up"};
document.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",()=>{navigator.clipboard.writeText(COPY[b.dataset.copy]).then(()=>toast("Copied")).catch(()=>toast("Select and copy manually"))}));

}
