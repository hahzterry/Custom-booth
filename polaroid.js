/* polaroid.js — the Living Polaroid.

   One instant-film print, drawn to genuine Polaroid 600 geometry, with the
   photo window as the only thing that ever changes. The paper, the shadow,
   the felt-tip handwriting and the event copy are rendered once into a
   chrome layer with a hole where the photograph goes; every video frame is
   then two drawImage calls and a composite. That is what makes a 105-frame
   encode cheap enough to do on an iPad, and it is also the design promise:
   the frame cannot drift because it is literally the same pixels each frame.

   The photograph gets its lightweight fixed print finish and nothing else —
   no beautifying, relighting or glow. That existing pass remains imported
   from covers.js, while the heavier adaptive analysis stays magazine-only. */
(function(global){
"use strict";

/* ---------- geometry ---------- */

/* Real instant film: 3.5in x 4.233in overall, image area 3.108in x 3.024in,
   equal borders on the sides and top, the rest falling to the bottom. Those
   ratios are the whole reason a Polaroid reads as a Polaroid, so everything
   is measured off the print rather than styled by eye.

   The one deliberate departure: the bottom border is deepened from the true
   0.289 of print width to 0.40. On real film that space is empty and reads as
   a margin; here it is carrying four lines of handwriting, and at the true
   depth the writing fills it wall to wall and stops looking written on. The
   photo, the sides and the top stay exactly to the film. */
const SIDE=0.196/3.5;      /* of print width, from the film */
const IMG_W=3.108/3.5;     /* of print width, from the film */
const IMG_RATIO=3.108/3.024;
const BOTTOM=0.40;         /* of print width — deepened from the film's 0.289 */
const MARGIN=0.026;        /* backdrop around the print, so the shadow reads */
const CORNER=0.014;

function size(base){
  const W=Math.round(base)+(Math.round(base)&1?1:0);
  const margin=Math.round(W*MARGIN);
  const printW=W-margin*2;
  const side=Math.round(printW*SIDE);
  const imgW=Math.round(printW*IMG_W);
  const imgH=Math.round(imgW/IMG_RATIO);
  let printH=side+imgH+Math.round(printW*BOTTOM);
  if((printH+margin*2)&1)printH++;
  const H=printH+margin*2;
  return {
    W,H,margin,printW,printH,
    photo:{x:margin+side,y:margin+side,w:imgW,h:imgH},
    corner:Math.round(printW*CORNER)
  };
}

/* ---------- copy ---------- */

const COPY_KEYS=["line1","line2","line3","line4"];
/* The handwriting face arrives as a resolved stack from fonts.js — the
   Polaroid does not get to have an opinion about which faces exist. */
const HAND_FALLBACK='"Marker Felt","Bradley Hand","Segoe Print",cursive';
const INK="#16130f";

function derive(s){
  const title=(s&&s.eventTitle)||"";
  const name=Covers.firstName(title)||"Tonight";
  const age=Covers.eventAge(title);
  const date=String((s&&s.date)||"").trim();
  return {
    line1:age?`${name}'s ${Covers.ordinal(age)} ♡`:`${name} ♡`,
    line2:date,
    line3:"Good Music • Good People • Good Vibes",
    line4:"Let's make memories ♡"
  };
}
/* Same contract as the covers and the screen text: blank means "write it for
   me from the event title", and the admin field shows that as its placeholder. */
function copyFor(s){
  const d=derive(s),out={};
  COPY_KEYS.forEach(k=>{
    const stored=s&&s["polaroid"+k.charAt(0).toUpperCase()+k.slice(1)];
    const v=typeof stored==="string"?stored.trim():"";
    out[k]=v||d[k]||"";
  });
  return out;
}

/* ---------- timeline ---------- */

/* Every photograph receives one continuous hold. The final dissolve returns
   fully to Photo 1 before the file loops, so the last and first frames agree
   without splitting the first photograph between opposite ends of the MP4. */
function timeline(o){
  const count=Math.max(1,(o&&o.count)||3);
  const fade=Math.max(0,(o&&o.fade!==undefined)?o.fade:0.4);
  const hold=Math.max(0.2,(o&&o.hold)||1);
  const segs=[{a:0,b:0,dur:hold}];
  for(let i=1;i<count;i++){
    if(fade>0)segs.push({a:i-1,b:i,dur:fade});
    segs.push({a:i,b:i,dur:hold});
  }
  if(count>1&&fade>0)segs.push({a:count-1,b:0,dur:fade});

  let duration=0;
  segs.forEach(s=>{s.start=duration;duration+=s.dur;});
  return {
    duration,segs,previewStart:0,
    at(t){
      const time=((t%duration)+duration)%duration;
      for(const s of segs){
        if(time<s.start+s.dur||s===segs[segs.length-1]){
          if(s.a===s.b)return {a:s.a,b:s.a,mix:0};
          const k=Math.min(1,Math.max(0,(time-s.start)/s.dur));
          /* Smoothstep: a linear dissolve has visible corners at both ends. */
          return {a:s.a,b:s.b,mix:k*k*(3-2*k)};
        }
      }
      return {a:0,b:0,mix:0};
    }
  };
}
/* The preview and encoded video share the same cyclic timeline. This tiny
   helper lets the UI wait for their identical Photo-1 seam before replacing
   one with the other, avoiding a visible jump to a different photograph. */
function timeToSeam(seconds,duration){
  const cycle=Math.max(0,Number(duration)||0);
  if(!cycle)return 0;
  const phase=((Number(seconds)||0)%cycle+cycle)%cycle;
  return phase<1e-9?0:cycle-phase;
}
/* Cuts need longer holds to fill the same four seconds. Kept here so the
   admin only ever chooses "crossfade or cut" and the clip length stays put. */
function timing(transition){
  return transition==="cut"?{fade:0,hold:1.4}:{fade:0.4,hold:1};
}

/* ---------- paper ---------- */

let fibreTile=null;
function paperFibre(){
  if(fibreTile)return fibreTile;
  fibreTile=document.createElement("canvas");
  fibreTile.width=fibreTile.height=128;
  const g=fibreTile.getContext("2d");
  const d=g.createImageData(128,128);
  for(let i=0;i<d.data.length;i+=4){
    const v=128+(Math.random()*2-1)*26;
    d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;
  }
  g.putImageData(d,0,0);
  return fibreTile;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ---------- handwriting ---------- */

/* A deterministic wobble per line. Real handwriting is never square to the
   paper, but the jitter has to be a pure function of the text: a random tilt
   would make the animated preview disagree with the exported file, and would
   make consecutive video frames shimmer. */
function seed(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return ((h>>>0)%2000)/1000-1;
}
/* Hearts are drawn, not typed. No handwriting face carries ♡, so the glyph
   falls back to a symbol font and lands beside the marker text at half its
   weight — the one detail that gives the whole thing away as a font rather
   than a pen. Splitting the line lets the heart be stroked in the same ink
   at the same width as everything around it. */
const HEART=/[♡♥❤]/;
const HEART_ADVANCE=1.0;
function handParts(text){return String(text||"").split(/([♡♥❤])/).filter(p=>p!=="");}
function handWidth(ctx,parts,size){
  let w=0;
  for(const p of parts)w+=HEART.test(p)?size*HEART_ADVANCE:ctx.measureText(p).width;
  return w;
}
function fitHand(ctx,parts,maxW,startSize,family,minSize){
  let s=startSize;
  while(s>minSize){
    ctx.font=`400 ${s}px ${family}`;
    if(handWidth(ctx,parts,s)<=maxW)break;
    s-=1;
  }
  ctx.font=`400 ${s}px ${family}`;
  return s;
}
/* A felt tip laid on paper does two things a font does not: it puts down a
   stroke much heavier than any digital handwriting face draws, and the ink
   creeps a little way into the paper fibres around it. So each line is drawn
   three times — a wide, very faint bleed, then the widened outline, then the
   fill. Without the bleed the letters look stamped; without the widening they
   look like a font pretending. */
const BLEED=0.052;
/* The heart is stroked at the marker's own stem width, not at the outline
   width used to fatten the glyphs. A felt tip cannot draw a hairline next to
   letters this heavy, and a delicate heart beside them is the giveaway. */
const HEART_STEM=0.115;
function markLine(ctx,parts,fontSize,lw,draw){
  let x=-handWidth(ctx,parts,fontSize)/2;
  for(const part of parts){
    if(HEART.test(part)){
      /* Sized to the marker's cap height, not to the em: a heart that
         matches the letters beside it is the whole point of drawing it. */
      Covers.heartPath(ctx,x+fontSize*HEART_ADVANCE/2,-fontSize*0.33,fontSize*0.40,fontSize*0.76);
      ctx.lineWidth=Math.max(1,fontSize*HEART_STEM+(lw-fontSize*BLEED));
      ctx.stroke();
      ctx.lineWidth=lw;
      x+=fontSize*HEART_ADVANCE;
    }else{
      draw(part,x);
      x+=ctx.measureText(part).width;
    }
  }
}
function inkLine(ctx,parts,cx,y,fontSize,tilt,family){
  ctx.save();
  ctx.translate(cx,y);
  ctx.rotate(tilt);
  ctx.textAlign="left";
  ctx.lineJoin="round";
  ctx.lineCap="round";
  ctx.strokeStyle=INK;
  ctx.fillStyle=INK;
  ctx.font=`400 ${fontSize}px ${family}`;
  const lw=Math.max(0.8,fontSize*BLEED);

  ctx.globalAlpha=0.055;
  ctx.lineWidth=lw*2.7;
  markLine(ctx,parts,fontSize,lw*2.7,(t,x)=>ctx.strokeText(t,x,0));

  ctx.globalAlpha=1;
  ctx.lineWidth=lw;
  markLine(ctx,parts,fontSize,lw,(t,x)=>{ctx.strokeText(t,x,0);ctx.fillText(t,x,0);});

  ctx.restore();
}
function drawHand(ctx,geo,copy,hand){
  const family=hand||HAND_FALLBACK;
  const lines=COPY_KEYS.map(k=>String(copy[k]||"").trim()).filter(Boolean);
  if(!lines.length)return;

  const zoneW=Math.round(geo.printW*0.84);
  const cx=geo.margin+geo.printW/2;
  const top=geo.photo.y+geo.photo.h;
  const zoneH=(geo.margin+geo.printH)-top;

  /* First line is the title, the rest are detail. One line on its own gets
     the title treatment and the whole border to itself. */
  /* Sized off the print's width, not its height: the bottom border is the
     one dimension that is a design choice rather than the film's, so pinning
     type to it would make the writing grow every time the border deepens. */
  const measured=lines.map((text,i)=>{
    const start=i===0?geo.printW*0.072:geo.printW*0.037;
    const parts=handParts(text);
    const s=fitHand(ctx,parts,zoneW,start,family,geo.printW*0.020);
    return {text,parts,size:s,lead:s*(i===0?1.34:1.60)};
  });
  /* Centre the ink, not the leading: the trailing lead below the last line
     is space the eye does not see, and counting it drops the block low. */
  const inked=measured.reduce((sum,m,i)=>sum+(i===lines.length-1?m.size:m.lead),0);
  let y=top+(zoneH-inked)*0.46+measured[0].size*0.78;

  measured.forEach(m=>{
    const w=seed(m.text);
    inkLine(ctx,m.parts,cx+w*geo.printW*0.006,y+w*geo.printH*0.0018,m.size,w*0.0075,family);
    y+=m.lead;
  });
}

/* The output credit belongs to the stationary film chrome. Painting it here
   guarantees that the live preview, print PNG and every encoded video frame
   contain the same deliberate footer. */
function attributionLabel(attribution){
  if(!attribution)return "";
  return String(attribution.text||attribution.myBishBashText||attribution.brandName||"").trim();
}
function trackedInk(ctx,text,x,y,tracking){
  const chars=Array.from(String(text||""));
  let width=0;
  chars.forEach(ch=>{width+=ctx.measureText(ch).width+tracking;});
  width=Math.max(0,width-tracking);
  let at=x-width/2;
  chars.forEach(ch=>{ctx.fillText(ch,at,y);at+=ctx.measureText(ch).width+tracking;});
}
function drawAttribution(ctx,geo,attribution){
  if(!attribution)return;
  const label=attributionLabel(attribution),logo=attribution.logoImage||null;
  if(!label&&!logo)return;
  const business=/business|white/i.test(String(attribution.mode||""));
  const y=geo.margin+geo.printH-geo.printW*.026;
  const size=Math.max(7,geo.printW*.0125),tracking=size*.18;
  ctx.save();
  ctx.textBaseline="alphabetic";
  ctx.textAlign="left";
  ctx.fillStyle=business?(attribution.primaryColor||INK):"rgba(22,19,15,.72)";
  ctx.font=`800 ${size}px "Avenir Next",Avenir,"Helvetica Neue",Arial,sans-serif`;
  if(label)trackedInk(ctx,label.toUpperCase(),geo.W/2,y,tracking);
  if(logo){
    try{
      const ih=logo.naturalHeight||logo.height||1,iw=logo.naturalWidth||logo.width||1;
      const h=geo.printW*.026,w=Math.min(geo.printW*.13,h*iw/Math.max(1,ih));
      ctx.drawImage(logo,geo.margin+geo.printW*.035,y-h*.86,w,h);
    }catch(e){}
  }
  ctx.restore();
}

/* ---------- layers ---------- */

/* Everything that never moves, with the photo window punched out of it. */
function buildChrome(geo,copy,hand,backdrop,attribution){
  const c=document.createElement("canvas");
  c.width=geo.W;c.height=geo.H;
  const ctx=c.getContext("2d");

  ctx.fillStyle=backdrop||"#0a0a0a";
  ctx.fillRect(0,0,geo.W,geo.H);

  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.6)";
  ctx.shadowBlur=geo.margin*1.9;
  ctx.shadowOffsetY=geo.margin*0.5;
  const paper=ctx.createLinearGradient(0,geo.margin,0,geo.margin+geo.printH);
  paper.addColorStop(0,"#fffdf8");
  paper.addColorStop(0.55,"#fbf7ee");
  paper.addColorStop(1,"#f4eee2");
  ctx.fillStyle=paper;
  roundRect(ctx,geo.margin,geo.margin,geo.printW,geo.printH,geo.corner);
  ctx.fill();
  ctx.restore();

  /* Paper grain, clipped to the print so it never crawls over the backdrop. */
  ctx.save();
  roundRect(ctx,geo.margin,geo.margin,geo.printW,geo.printH,geo.corner);
  ctx.clip();
  const pattern=ctx.createPattern(paperFibre(),"repeat");
  if(pattern){
    ctx.globalAlpha=0.035;
    ctx.globalCompositeOperation="overlay";
    ctx.fillStyle=pattern;
    ctx.fillRect(geo.margin,geo.margin,geo.printW,geo.printH);
  }
  ctx.restore();

  drawHand(ctx,geo,copy,hand);
  drawAttribution(ctx,geo,attribution);

  const p=geo.photo;
  /* The hole. Cleared last so nothing drawn above can creep into the window. */
  ctx.clearRect(p.x,p.y,p.w,p.h);
  /* Instant film sits a hair proud of its emulsion; a one-pixel inset keeps
     the photo edge from looking pasted on. Drawn over the photo at composite
     time because it belongs to the print, not the picture. */
  ctx.save();
  ctx.strokeStyle="rgba(40,34,26,.30)";
  ctx.lineWidth=1;
  ctx.strokeRect(p.x+0.5,p.y+0.5,p.w-1,p.h-1);
  ctx.restore();

  return c;
}

function sourceSize(img){
  if(!img)return {w:0,h:0};
  return {
    w:Number(img.videoWidth||img.naturalWidth||img.width||0),
    h:Number(img.videoHeight||img.naturalHeight||img.height||0)
  };
}
function canDrawSource(img){
  const source=sourceSize(img);
  return Number.isFinite(source.w)&&Number.isFinite(source.h)&&source.w>0&&source.h>0;
}
function clearPlate(ctx,w,h){
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#0d0d0d";
  ctx.fillRect(0,0,w,h);
  ctx.restore();
}
/* One crop-and-finish path for authored still plates, a live camera frame and
   the exact photograph frozen at the motion/hold boundary. Keeping that path
   shared is what prevents the held photograph changing crop or colour when
   the movement resolves. */
function paintPlate(ctx,img,w,h,anchorY,mirror){
  if(!canDrawSource(img))return false;
  clearPlate(ctx,w,h);
  ctx.save();
  if(mirror){ctx.translate(w,0);ctx.scale(-1,1);}
  Covers.drawPhotoCover(ctx,img,0,0,w,h,anchorY===undefined?0.38:anchorY);
  ctx.restore();
  Covers.polaroidFinish(ctx,0,0,w,h);
  return true;
}

/* The photograph, cropped to the window and print-finished, once per source
   image. Doing the finish here rather than per authored video frame is both
   cheaper and more correct: it is a pass on the photograph, not the film. */
function buildPlate(img,geo){
  const c=document.createElement("canvas");
  c.width=geo.photo.w;c.height=geo.photo.h;
  const ctx=c.getContext("2d",{willReadFrequently:true});
  clearPlate(ctx,c.width,c.height);
  if(img)paintPlate(ctx,img,c.width,c.height,0.38,false);
  return c;
}

/* Draft event previews must never be mistaken for an activated keepsake. The
   watermark is authored as a stationary overlay once, then composited after
   both the photograph and print chrome so it is present in every frame. */
function buildDraftLayer(geo){
  const c=document.createElement("canvas");
  c.width=geo.W;c.height=geo.H;
  const ctx=c.getContext("2d");
  ctx.save();
  roundRect(ctx,geo.margin,geo.margin,geo.printW,geo.printH,geo.corner);
  ctx.clip();
  ctx.translate(geo.W/2,geo.margin+geo.printH*.47);
  ctx.rotate(-Math.PI/6);
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  const fontSize=Math.max(34,geo.printW*.15);
  ctx.font=`900 ${fontSize}px "Avenir Next",Avenir,"Helvetica Neue",Arial,sans-serif`;
  ctx.globalAlpha=.18;
  ctx.lineWidth=Math.max(2,fontSize*.055);
  ctx.strokeStyle="#ffffff";
  if(typeof ctx.strokeText==="function")ctx.strokeText("SAMPLE",0,0);
  ctx.fillStyle="#111111";
  ctx.fillText("SAMPLE",0,0);
  ctx.restore();
  return c;
}

function paintSinglePlate(ctx,geo,chrome,plate,draft){
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,geo.W,geo.H);
  ctx.drawImage(plate,geo.photo.x,geo.photo.y);
  ctx.drawImage(chrome,0,0);
  if(draft)ctx.drawImage(draft,0,0);
  ctx.restore();
}

/* ---------- api ---------- */

/* compose() does all the expensive work once and hands back something whose
   drawFrame is cheap enough to run at 25fps on an iPad and to encode 105
   times without the guest waiting. The animated preview and the MP4 call the
   same drawFrame, so what a guest watches is exactly what they receive. */
function compose(o){
  const geo=size(o.base||1296);
  const images=(o.images||[]).filter(Boolean);
  const chrome=buildChrome(geo,o.copy||{},o.hand||HAND_FALLBACK,o.backdrop,o.attribution);
  const draft=o.draftPreview===true?buildDraftLayer(geo):null;
  const plates=images.map(img=>buildPlate(img,geo));
  const t=timing(o.transition);
  const line=timeline({count:plates.length||1,fade:t.fade,hold:t.hold});

  function paint(ctx,a,b,mix){
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,geo.W,geo.H);
    const p=geo.photo;
    const first=plates[a]||plates[0];
    if(first)ctx.drawImage(first,p.x,p.y);
    if(mix>0&&plates[b]&&plates[b]!==first){
      ctx.globalAlpha=mix;
      ctx.drawImage(plates[b],p.x,p.y);
      ctx.globalAlpha=1;
    }
    ctx.drawImage(chrome,0,0);
    if(draft)ctx.drawImage(draft,0,0);
    ctx.restore();
  }

  return {
    geo,timeline:line,draftPreview:!!draft,
    frameCount(fps){return Math.max(1,Math.round(line.duration*fps));},
    drawAt(ctx,seconds){const s=line.at(seconds);paint(ctx,s.a,s.b,s.mix);},
    drawFrame(ctx,i,fps){this.drawAt(ctx,i/fps);},
    drawStill(ctx,index){paint(ctx,Math.min(Math.max(0,index||0),Math.max(0,plates.length-1)),0,0);}
  };
}

/* A live Moving Polaroid uses the same film geometry, paper, handwriting,
   attribution and fixed photographic finish as compose(). Only the source in
   the aperture changes. drawFinalStill() freezes its source on the first call
   and reuses those exact pixels for every subsequent hold frame.

   Typical motion.js integration:
     const print=Polaroid.composeLive(options);
     Motion.record({
       canvas,
       drawMotionFrame(ctx){ print.drawLive(ctx,video); },
       drawFinalStill(ctx){ print.drawFinalStill(ctx,video); }
     }); */
function composeLive(options){
  const o=options||{};
  const geo=size(o.base||1296);
  const chrome=buildChrome(geo,o.copy||{},o.hand||HAND_FALLBACK,o.backdrop,o.attribution);
  const draft=o.draftPreview===true?buildDraftLayer(geo):null;
  const anchorY=Number.isFinite(Number(o.anchorY))?Math.max(0,Math.min(1,Number(o.anchorY))):0.38;
  const mirror=o.mirror===true;

  const livePlate=document.createElement("canvas");
  livePlate.width=geo.photo.w;livePlate.height=geo.photo.h;
  const liveCtx=livePlate.getContext("2d",{willReadFrequently:true});
  clearPlate(liveCtx,livePlate.width,livePlate.height);

  const finalPlate=document.createElement("canvas");
  finalPlate.width=geo.photo.w;finalPlate.height=geo.photo.h;
  const finalCtx=finalPlate.getContext("2d",{willReadFrequently:true});
  clearPlate(finalCtx,finalPlate.width,finalPlate.height);
  let finalReady=false;

  function captureFinalStill(source){
    if(!canDrawSource(source))return false;
    const painted=paintPlate(finalCtx,source,finalPlate.width,finalPlate.height,anchorY,mirror);
    if(painted)finalReady=true;
    return painted;
  }

  return {
    geo,
    draftPreview:!!draft,
    drawLive(ctx,source){
      const ready=paintPlate(liveCtx,source,livePlate.width,livePlate.height,anchorY,mirror);
      paintSinglePlate(ctx,geo,chrome,livePlate,draft);
      return ready;
    },
    captureFinalStill,
    drawFinalStill(ctx,source){
      /* Supplying the live video is safe on every hold frame: it is sampled
         once, at the boundary, and ignored after the exact plate is ready. */
      if(!finalReady&&source)captureFinalStill(source);
      if(!finalReady)throw new Error("Capture the final photograph before drawing its hold.");
      paintSinglePlate(ctx,geo,chrome,finalPlate,draft);
      return true;
    },
    hasFinalStill(){return finalReady;},
    resetFinalStill(){
      finalReady=false;
      clearPlate(finalCtx,finalPlate.width,finalPlate.height);
    }
  };
}

/* Single still, for the admin preview. */
function render(ctx,opts){
  const job=compose({
    base:opts.width,images:[opts.img],copy:opts.copy,
    hand:opts.hand,transition:opts.transition,backdrop:opts.backdrop,
    attribution:opts.attribution
  });
  job.drawStill(ctx,0);
  return job.geo;
}

global.Polaroid={size,derive,copyFor,copyKeys:COPY_KEYS,timeline,timeToSeam,timing,compose,composeLive,render};

})(window);
