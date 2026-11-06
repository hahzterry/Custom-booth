/* covers.js — editorial magazine cover engine.
   Four templates, each laid out for portrait and landscape from a shared
   copy model. Everything is measured off the canvas, not hard-coded, so a
   longer masthead or a brighter photo re-flows instead of colliding. */
(function(global){
"use strict";

/* The four faces every template draws with. Mutated in place by render() from
   whatever the organiser picked in Admin, so a template only ever asks for
   "the serif" and never for a specific family. The values here are the
   shipped defaults and match fonts.js — this object is what gets used if a
   caller renders without passing fonts at all. */
const FONT={
  serif:'Didot,"Bodoni 72","Playfair Display",Georgia,"Times New Roman",serif',
  sans:'"Avenir Next",Avenir,"Helvetica Neue",Helvetica,Arial,sans-serif',
  condensed:'"Avenir Next Condensed","Arial Narrow",Impact,"Avenir Next",sans-serif',
  script:'"Snell Roundhand","Apple Chancery","Segoe Script","Brush Script MT",cursive'
};

const TEMPLATES=[
  {key:"keepsake",  label:"Keepsake",  hint:"Numbered guest edition"},
  {key:"editorial", label:"Editorial", hint:"Full-bleed fashion"},
  {key:"noir",      label:"Noir",      hint:"Deep tonal drama"},
  {key:"press",     label:"Press",     hint:"Bold sidebar"}
];

/* Magazine trim: 1.4 : 1, flipped for landscape sessions. This keeps the
   cover close to A4 while retaining enough width for the editorial layouts. */
const RATIO=1.4;
function coverSize(orientation,base){
  const b=base||1200;
  return orientation==="landscape"?{width:Math.round(b*RATIO),height:b}:{width:b,height:Math.round(b*RATIO)};
}

/* ---------- copy ---------- */

const ONES=["ZERO","ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE","TEN","ELEVEN","TWELVE","THIRTEEN","FOURTEEN","FIFTEEN","SIXTEEN","SEVENTEEN","EIGHTEEN","NINETEEN"];
const TENS=["","","TWENTY","THIRTY","FORTY","FIFTY","SIXTY","SEVENTY","EIGHTY","NINETY"];
function numberWords(n){
  n=Number(n);
  if(!Number.isFinite(n)||n<0||n>99)return String(n||"");
  if(n<20)return ONES[n];
  const o=n%10;
  return o?TENS[Math.floor(n/10)]+" "+ONES[o]:TENS[Math.floor(n/10)];
}
function ordinal(n){
  const v=n%100,suf=["th","st","nd","rd"];
  return n+(suf[(v-20)%10]||suf[v]||suf[0]);
}
function firstName(title){
  const m=String(title||"").trim().match(/^([\p{L}][\p{L}'’-]*)/u);
  if(!m)return "";
  return m[1].replace(/['’]s$/i,"");
}
function eventAge(title){
  const m=String(title||"").match(/\b(\d{1,3})\s*(?:st|nd|rd|th)\b/i)||String(title||"").match(/\b(\d{1,2})\b/);
  if(!m)return null;
  const n=Number(m[1]);
  return n>0&&n<=120?n:null;
}
function occasionWord(title){
  const words=String(title||"").trim().split(/\s+/).filter(Boolean);
  const last=words[words.length-1]||"";
  return /^[\p{L}]{4,}$/u.test(last)?last.toUpperCase():"CELEBRATION";
}

/* Defaults generated from the event title, so a brand new event gets a
   finished-looking cover before anyone opens the admin panel. */
function derive(s){
  const name=firstName(s&&s.eventTitle)||"TONIGHT";
  const age=eventAge(s&&s.eventTitle);
  const year=String((s&&s.date)||"").trim();
  const occ=occasionWord(s&&s.eventTitle);
  const occTitle=occ.charAt(0)+occ.slice(1).toLowerCase();
  return {
    masthead:name.toUpperCase(),
    occasion:occasionWord(s&&s.eventTitle),
    script:age?`${name}'s ${ordinal(age)}`:name,
    skyline1:age?`ISSUE ${age}`:"SPECIAL ISSUE",
    skyline2:year,
    skyline3:"COLLECTOR'S EDITION",
    f1Title:"ONE NIGHT ONLY",
    f1Dek:"A night. A legend. A memory forever.",
    f2Title:"Confidence is the best outfit",
    f2Dek:"Style. Energy. Era.",
    f3Title:"The next chapter",
    f3Dek:"New goals. Bigger dreams. Unstoppable.",
    big:age?numberWords(age):name.toUpperCase(),
    bigDek:age?"Not just an age. A whole vibe.":"One night. One story.",
    footer:"Confidence · Beauty · Energy",
    barcode:(age?String(age).padStart(3,"0"):"001")+"  "+(year||""),

    /* Keepsake slots */
    eyebrow:`${name}'s ${occTitle} Edition`,
    stack:`${occTitle} Edition`,
    dateLine:year,
    scriptSmall:"celebrating",
    heroScript:"The night we all",
    hero:"Celebrated Together",
    thanks:"Thank you for being part of something special",
    hashtag:("#"+name+occTitle+((year.match(/\d{4}/)||[""])[0])).replace(/[^\w#]/g,""),
    icons:"Captured memories, Shared moments, Made magic",
    editionOf:"",
    editionWord:"Edition",
    ofWord:"of"
  };
}
const COPY_KEYS=["masthead","occasion","script","skyline1","skyline2","skyline3","f1Title","f1Dek","f2Title","f2Dek","f3Title","f3Dek","big","bigDek","footer","barcode",
  "eyebrow","stack","dateLine","scriptSmall","heroScript","hero","thanks","hashtag","icons","editionOf","editionWord","ofWord"];
function copyFor(s){
  const d=derive(s),out={};
  COPY_KEYS.forEach(k=>{
    const stored=s&&s["cover"+k.charAt(0).toUpperCase()+k.slice(1)];
    const v=typeof stored==="string"?stored.trim():"";
    out[k]=v||d[k]||"";
  });
  return out;
}

/* ---------- text ---------- */

function setFont(ctx,weight,size,family){ctx.font=`${weight} ${Math.max(1,Math.round(size*10)/10)}px ${family}`;}
function trackedWidth(ctx,text,track){
  const chars=Array.from(String(text||""));
  if(!chars.length)return 0;
  let w=0;for(const c of chars)w+=ctx.measureText(c).width+track;
  return w-track;
}
function drawTracked(ctx,text,x,y,track,align){
  const chars=Array.from(String(text||""));
  if(!chars.length)return 0;
  const w=trackedWidth(ctx,text,track);
  let cx=align==="center"?x-w/2:align==="right"?x-w:x;
  const prev=ctx.textAlign;
  ctx.textAlign="left";
  for(const c of chars){ctx.fillText(c,cx,y);cx+=ctx.measureText(c).width+track;}
  ctx.textAlign=prev;
  return w;
}
function fitTracked(ctx,text,maxW,startSize,family,weight,trackEm,minSize){
  let size=startSize;
  for(let i=0;i<80;i++){
    setFont(ctx,weight,size,family);
    if(trackedWidth(ctx,text,size*trackEm)<=maxW||size<=minSize)break;
    size=Math.max(minSize,size*0.95);
  }
  setFont(ctx,weight,size,family);
  return size;
}
function wrapTracked(ctx,text,maxW,track){
  const words=String(text||"").split(/\s+/).filter(Boolean);
  const lines=[];let line="";
  for(const w of words){
    const test=line?line+" "+w:w;
    if(line&&trackedWidth(ctx,test,track)>maxW){lines.push(line);line=w;}
    else line=test;
  }
  if(line)lines.push(line);
  return lines;
}
/* Shrink until the text fits both the width and the line budget. */
function fitBlock(ctx,text,maxW,startSize,family,weight,trackEm,maxLines,minSize){
  let size=startSize,lines=[],track=0;
  for(let i=0;i<80;i++){
    setFont(ctx,weight,size,family);
    track=size*trackEm;
    lines=wrapTracked(ctx,text,maxW,track);
    const widest=lines.reduce((m,l)=>Math.max(m,trackedWidth(ctx,l,track)),0);
    if((lines.length<=maxLines&&widest<=maxW)||size<=minSize)break;
    size=Math.max(minSize,size*0.94);
  }
  setFont(ctx,weight,size,family);
  return {size,track,lines:lines.slice(0,maxLines)};
}
function drawLines(ctx,lines,x,y,lineH,track,align){
  lines.forEach((l,i)=>drawTracked(ctx,l,x,y+i*lineH,track,align));
}

/* ---------- image + light ---------- */

function drawPhotoCover(ctx,img,x,y,w,h,anchorY){
  const iw=img.width||img.videoWidth||1,ih=img.height||img.videoHeight||1;
  const scale=Math.max(w/iw,h/ih);
  const sw=w/scale,sh=h/scale;
  /* Preserve the camera's available detail when it is resized to cover trim. */
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(img,(iw-sw)/2,(ih-sh)*(anchorY===undefined?0.4:anchorY),sw,sh,x,y,w,h);
}
let sampler=null;
/* Average luminance of a region of the canvas, read through a 24px proxy
   so this stays cheap on an iPad. */
function regionLuma(ctx,x,y,w,h){
  try{
    x=Math.max(0,Math.round(x));y=Math.max(0,Math.round(y));
    w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
    if(!sampler){sampler=document.createElement("canvas");sampler.width=24;sampler.height=24;}
    const sc=sampler.getContext("2d",{willReadFrequently:true});
    sc.clearRect(0,0,24,24);
    sc.drawImage(ctx.canvas,x,y,w,h,0,0,24,24);
    const d=sc.getImageData(0,0,24,24).data;
    let sum=0;
    for(let i=0;i<d.length;i+=4)sum+=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;
    return sum/(d.length/4);
  }catch(e){return 0.5;}
}
/* Type lives in the outer thirds of a band; a dark subject in the middle
   must not average the scrim down and wash that type out. */
function edgeLuma(L,edge,depth){
  const {ctx,W,H}=L;
  if(edge==="top")return Math.max(regionLuma(ctx,0,0,W*0.42,depth),regionLuma(ctx,W*0.58,0,W*0.42,depth));
  if(edge==="bottom")return Math.max(regionLuma(ctx,0,H-depth,W*0.42,depth),regionLuma(ctx,W*0.58,H-depth,W*0.42,depth));
  if(edge==="left")return regionLuma(ctx,0,H*0.3,depth,H*0.4);
  return regionLuma(ctx,W-depth,H*0.3,depth,H*0.4);
}
/* Bright photo -> heavier scrim, so white type never washes out. */
function adapt(luma,min,max){
  const t=Math.min(1,Math.max(0,(luma-0.28)/0.44));
  return min+(max-min)*t;
}
function bandScrim(L,edge,depth,alpha){
  const {ctx,W,H}=L;
  let g;
  if(edge==="top")g=ctx.createLinearGradient(0,0,0,depth);
  else if(edge==="bottom")g=ctx.createLinearGradient(0,H,0,H-depth);
  else if(edge==="left")g=ctx.createLinearGradient(0,0,depth,0);
  else g=ctx.createLinearGradient(W,0,W-depth,0);
  g.addColorStop(0,`rgba(0,0,0,${alpha})`);
  g.addColorStop(0.45,`rgba(0,0,0,${alpha*0.5})`);
  g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.save();ctx.fillStyle=g;
  if(edge==="top")ctx.fillRect(0,0,W,depth);
  else if(edge==="bottom")ctx.fillRect(0,H-depth,W,depth);
  else if(edge==="left")ctx.fillRect(0,0,depth,H);
  else ctx.fillRect(W-depth,0,depth,H);
  ctx.restore();
}
/* A feathered pool of shade behind one block of type. Reads as lighting
   falloff rather than a box, and rescues display type that lands on a
   bright part of the photo. */
function softPlate(L,x,y,w,h,alpha){
  const {ctx}=L;
  const cx=x+w/2,cy=y+h/2,rx=w*0.82,ry=Math.max(1,h*0.95);
  ctx.save();
  ctx.translate(cx,cy);ctx.scale(rx/ry,1);
  /* Flat through the type, feathered only outside it. */
  const g=ctx.createRadialGradient(0,0,ry*0.1,0,0,ry);
  g.addColorStop(0,`rgba(0,0,0,${alpha})`);
  g.addColorStop(0.62,`rgba(0,0,0,${alpha*0.86})`);
  g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g;ctx.fillRect(-ry,-ry,ry*2,ry*2);
  ctx.restore();
}
function plateIfBright(L,x,y,w,h,maxAlpha){
  if(w<=0||h<=0)return;
  const l=regionLuma(L.ctx,x,y,w,h);
  if(l<0.33)return;
  softPlate(L,x,y,w,h,adapt(l,0.14,maxAlpha));
}
function wash(ctx,W,H,color,alpha,mode){
  ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation=mode||"overlay";
  ctx.fillStyle=color;ctx.fillRect(0,0,W,H);ctx.restore();
}
/* ---------- grading ---------- */

/* Canvas `ctx.filter` only shipped in Safari 17 and fails *silently* before
   it: on an older booth iPad every strip filter and every cover's template
   grade simply did nothing, while the pixel-based editorial finish carried
   on working — which is why the magazine looked right and the filter buttons
   looked broken. So grades are pixels here too, and nothing in the booth
   depends on `ctx.filter` any more.

   Every function used — brightness, contrast, saturate, grayscale, sepia —
   is affine in sRGB, so each compiles to a 3x3 matrix and an offset. They are
   applied in sequence rather than multiplied into one matrix, because CSS
   clamps between filter functions: brightness(1.07) hits white before the
   next function sees it. Collapsing the chain drifts by up to 13/255 in blown
   highlights, which is exactly where Warm and Glow live. */

const LUMA=[0.2126,0.7152,0.0722];
const SEPIA=[0.393,0.769,0.189, 0.349,0.686,0.168, 0.272,0.534,0.131];
function identity(){return [1,0,0, 0,1,0, 0,0,1];}
/* grayscale(g) is exactly saturate(1-g), so one matrix serves both. */
function saturateM(s){
  const r=LUMA[0],g=LUMA[1],b=LUMA[2];
  return [r+(1-r)*s, g-g*s,     b-b*s,
          r-r*s,     g+(1-g)*s, b-b*s,
          r-r*s,     g-g*s,     b+(1-b)*s];
}
function sepiaM(x){
  const I=identity(),m=new Array(9);
  for(let i=0;i<9;i++)m[i]=I[i]*(1-x)+SEPIA[i]*x;
  return m;
}
const gradeCache={};
function compileGrade(spec){
  const key=String(spec||"");
  if(gradeCache[key]!==undefined)return gradeCache[key];
  const re=/(brightness|contrast|saturate|grayscale|greyscale|sepia)\(\s*(-?[\d.]+)(%?)\s*\)/gi;
  const steps=[];
  let hit;
  while((hit=re.exec(key))){
    let v=parseFloat(hit[2]);
    if(hit[3]==="%")v/=100;
    if(!Number.isFinite(v))continue;
    const fn=hit[1].toLowerCase();
    if(fn==="brightness")steps.push({m:[v,0,0, 0,v,0, 0,0,v],o:0});
    else if(fn==="contrast")steps.push({m:[v,0,0, 0,v,0, 0,0,v],o:127.5*(1-v)});
    else if(fn==="saturate")steps.push({m:saturateM(v),o:0});
    else if(fn==="grayscale"||fn==="greyscale")steps.push({m:saturateM(1-v),o:0});
    else if(fn==="sepia")steps.push({m:sepiaM(v),o:0});
  }
  gradeCache[key]=steps.length?steps:null;
  return gradeCache[key];
}
function clamp255(v){return v<0?0:(v>255?255:v);}
/* Grades a rectangle in place. Rounds inward for the same reason the finish
   does: putImageData ignores the clip, so a sub-pixel sliver left ungraded
   is invisible where graded pixels outside the photo would not be. */
function applyGrade(ctx,x,y,w,h,spec){
  const steps=typeof spec==="string"?compileGrade(spec):spec;
  if(!steps||!steps.length)return;
  const ix=Math.max(0,Math.ceil(x)),iy=Math.max(0,Math.ceil(y));
  const iw=Math.min(ctx.canvas.width,Math.floor(x+w))-ix;
  const ih=Math.min(ctx.canvas.height,Math.floor(y+h))-iy;
  if(iw<=0||ih<=0)return;
  try{
    const image=ctx.getImageData(ix,iy,iw,ih),d=image.data,n=steps.length;
    for(let i=0;i<d.length;i+=4){
      let r=d[i],g=d[i+1],b=d[i+2];
      for(let s=0;s<n;s++){
        const m=steps[s].m,o=steps[s].o;
        const nr=m[0]*r+m[1]*g+m[2]*b+o;
        const ng=m[3]*r+m[4]*g+m[5]*b+o;
        const nb=m[6]*r+m[7]*g+m[8]*b+o;
        r=clamp255(nr);g=clamp255(ng);b=clamp255(nb);
      }
      d[i]=r;d[i+1]=g;d[i+2]=b;
    }
    ctx.putImageData(image,ix,iy);
  }catch(e){}
}

/* ---------- editorial finish ---------- */
/* The magazine finish is an adaptive, print-minded pixel pass. It never
   detects or reconstructs a face, isolates a background, changes geometry,
   paints light, or touches the typography. Spatial work is limited to
   luminance-only detail and one broad edge fall-off, so skin, hair, fabric and
   the original scene remain photographic rather than generated or airbrushed.

   Template colour is folded into the floating-point tone pass before its first
   staging write. That matters in white clothing and bright venues: the old
   sequence clipped a template grade before highlight recovery could see it.
   Luminance detail then works at twelve-bit precision before the final write. */

const EDITORIAL_FINISH={
  targetMid:0.45,exposureAdapt:0.24,minEV:-0.20,maxEV:0.20,upperMidOffset:0.17,
  densityGammaMax:1.20,densityMedianLow:0.20,densityMedianHigh:0.38,
  wbDeadband:0.035,wbFullCast:0.10,wbStrength:0.95,wbMin:0.935,wbMax:1.065,
  sCurve:0.065,shadowLift:0.006,shadowGammaMax:1.25,shadowPivot:0.22,highlightShoulder:0.035,
  highlightStart:0.56,highlightPeak:0.80,highlightEnd:0.985,
  blackDensity:0.018,whiteClean:0.022,matte:0.0035,
  saturation:0.94,vibrance:0.08,shadowChroma:0.86,
  densityChromaFloor:0.30,
  wbTailAuthority:0.25,wbWarmTailAuthority:0.10,
  wbCoreSupportStart:0.002,wbCoreSupportFull:0.010,
  wbColourProtect:0.40,wbSaturatedProtect:0.92,
  wbWarmRedProtect:0.92,wbWarmGreenProtect:0.28,wbWarmBlueProtect:0.25,
  noiseLight:0.010,noiseShadow:0.022,clarity:0.22,structureContrast:0.15,
  microContrast:0.10,preSharpen:2.00,finalSharpen:0.80,
  clarityPlaneProtect:0.35,structurePlaneProtect:0.65,
  broadDeltaCap:5/255,broadGuardRadius:8,
  grainOpacity:0.025,grainRange:0.68,paperTexture:0.0015,
  vignetteMin:0.075,vignetteMax:0.095,vignetteInner:0.25,vignetteOuter:1.00,
  floor:2.5/255,ceiling:253/255
};
function clamp01(v){return v<0?0:(v>1?1:v);}
function smoothstep(a,b,v){
  if(v<=a)return 0;if(v>=b)return 1;
  const t=(v-a)/(b-a);return t*t*(3-2*t);
}

/* Warm-pigment protection is a continuous confidence, never a colour-class
   switch. That matters on skin and smooth painted walls: neighbouring pixels
   separated by one camera code must not take visibly different paths. Signed,
   chroma-normalised margins also make the test behave consistently from
   shadows to highlights. */
function warmPigmentWeight(r,g,b){
  const span=Math.max(1,Math.max(r,g,b)-Math.min(r,g,b));
  const rg=(r-g)/span,gb=(g-b)/span;
  const ordered=smoothstep(-0.03,0.03,rg)*smoothstep(-0.03,0.03,gb);
  return ordered*smoothstep(-0.06,0.06,rg-0.85*gb);
}

/* `applyGrade` above keeps CSS's between-step clamping because strips depend
   on that exact behaviour. Covers use the same recipes as one affine float
   transform so the editorial shoulder can retain the grade's highlight
   headroom through tone/colour staging. */
const floatGradeCache={};
function compileFloatGrade(spec){
  const key=String(spec||"");
  if(floatGradeCache[key]!==undefined)return floatGradeCache[key];
  const steps=compileGrade(key);
  if(!steps||!steps.length){floatGradeCache[key]=null;return null;}
  let m=identity(),o=[0,0,0];
  for(const step of steps){
    const a=step.m,b=m,p=o;
    m=[
      a[0]*b[0]+a[1]*b[3]+a[2]*b[6],a[0]*b[1]+a[1]*b[4]+a[2]*b[7],a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
      a[3]*b[0]+a[4]*b[3]+a[5]*b[6],a[3]*b[1]+a[4]*b[4]+a[5]*b[7],a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
      a[6]*b[0]+a[7]*b[3]+a[8]*b[6],a[6]*b[1]+a[7]*b[4]+a[8]*b[7],a[6]*b[2]+a[7]*b[5]+a[8]*b[8]
    ];
    o=[
      a[0]*p[0]+a[1]*p[1]+a[2]*p[2]+step.o,
      a[3]*p[0]+a[4]*p[1]+a[5]*p[2]+step.o,
      a[6]*p[0]+a[7]*p[1]+a[8]*p[2]+step.o
    ];
  }
  return floatGradeCache[key]={m,o};
}

const ANALYSIS_BINS=512,ANALYSIS_MAX=1.5;
function histogramValue(hist,total,q){
  const wanted=Math.max(1,total*q);let seen=0;
  for(let i=0;i<hist.length;i++){
    seen+=hist[i];if(seen>=wanted)return i/(hist.length-1)*ANALYSIS_MAX;
  }
  return 1;
}
/* About fifty thousand regularly spaced samples are enough for a stable
   exposure/WB decision and keep four chooser thumbnails responsive. White
   balance listens mainly to low-chroma midtones and has a deadband, so a red
   dress or blue wall cannot make the whole photograph swing the other way. */
function analyseEditorial(d){
  const pixels=d.length/4,stride=Math.max(1,Math.floor(pixels/50000));
  const hist=new Uint32Array(ANALYSIS_BINS);
  let sampled=0,coreWeight=0,coreR=0,coreG=0,coreB=0;
  let tailWeight=0,tailR=0,tailG=0,tailB=0;
  let warmTailWeight=0,warmTailR=0,warmTailG=0,warmTailB=0;
  for(let p=0;p<pixels;p+=stride){
    const i=p*4;let r=d[i],g=d[i+1],b=d[i+2];
    const y=(LUMA[0]*r+LUMA[1]*g+LUMA[2]*b)/255;
    const bin=Math.max(0,Math.min(ANALYSIS_BINS-1,Math.round(y/ANALYSIS_MAX*(ANALYSIS_BINS-1))));
    hist[bin]++;sampled++;

    const cr=clamp255(r),cg=clamp255(g),cb=clamp255(b);
    const cy=LUMA[0]*cr+LUMA[1]*cg+LUMA[2]*cb;
    if(cy>31&&cy<237){
      const hi=Math.max(cr,cg,cb),lo=Math.min(cr,cg,cb);
      const chroma=(hi-lo)/Math.max(20,hi);
      /* White balance is inferred from the untouched capture, never from a
         template grade. Near-neutrals carry full weight. A much quieter
         illuminant tail lets a large tungsten/blue room vote without treating
         ordinary warm skin or saturated clothing as a grey card. */
      const tonalWeight=smoothstep(31,72,cy)*(1-smoothstep(205,237,cy));
      const warmWeight=warmPigmentWeight(cr,cg,cb);
      const skinExclusion=smoothstep(0.045,0.10,chroma)*warmWeight;
      const neutralWeight=(1-smoothstep(0.025,0.10,chroma))*
        (1-skinExclusion)*tonalWeight;
      if(neutralWeight>0){
        const weight=neutralWeight;
        coreWeight+=weight;coreR+=cr*weight;coreG+=cg*weight;coreB+=cb*weight;
      }
      /* A continuous, low-authority directional tail helps in rooms where no
         true neutral survives. It fades out before saturated clothing; warm
         pigment is excluded from this normal vote and handled by the quieter
         fallback below instead of crossing a hard classifier boundary. */
      const span=Math.max(1,hi-lo),rg=(cr-cg)/span,gb=(cg-cb)/span;
      const br=(cb-cg)/span,gr=(cg-cr)/span;
      const warmOrder=smoothstep(-0.03,0.03,rg)*smoothstep(-0.03,0.03,gb);
      const yellowDirection=warmOrder*smoothstep(-0.06,0.06,gb-1.08*rg);
      const blueOrder=smoothstep(-0.03,0.03,br)*smoothstep(-0.03,0.03,gr);
      const blueDirection=blueOrder*smoothstep(-0.06,0.06,gr-0.75*br);
      const tailDirection=Math.max(yellowDirection*(1-warmWeight),blueDirection);
      const tailGate=smoothstep(0.06,0.14,chroma)*
        (1-smoothstep(0.35,0.50,chroma));
      const directionalWeight=tailGate*tailDirection*tonalWeight;
      if(directionalWeight>0){
        const weight=directionalWeight;
        tailWeight+=weight;tailR+=cr*weight;tailG+=cg*weight;tailB+=cb*weight;
      }
      /* Equal-gap orange is ambiguous: it can be tungsten light, skin or brown
         fabric. Keep it out of the normal 25% room vote, but retain a separate
         10% fallback so an all-orange capture receives a real, gentle WB move.
         Per-pixel colour protection still guards complexion and clothing. */
      const warmDirectionalWeight=tailGate*warmWeight*tonalWeight;
      if(warmDirectionalWeight>0){
        const weight=warmDirectionalWeight;
        warmTailWeight+=weight;warmTailR+=cr*weight;
        warmTailG+=cg*weight;warmTailB+=cb*weight;
      }
    }
  }
  const p10=histogramValue(hist,sampled,0.10);
  const median=Math.max(0.025,histogramValue(hist,sampled,0.5));
  const p75=histogramValue(hist,sampled,0.75);
  /* Bright walls/windows should be able to pull a hazy scene down even when
     dark hair or clothing occupies the centre. Dark venues still key from
     their median and receive a lift rather than a blanket density increase. */
  const sceneMid=Math.max(median,p75-EDITORIAL_FINISH.upperMidOffset);
  const tonalSpan=median-p10;
  let requestedEV=EDITORIAL_FINISH.exposureAdapt*Math.log2(EDITORIAL_FINISH.targetMid/sceneMid);
  /* A uniformly pale/high-key frame is not evidence that every captured
     midtone needs a strong reduction. Complex bright scenes keep full
     correction; low-span scenes receive only a restrained negative move. */
  if(requestedEV<0)requestedEV*=0.30+0.70*smoothstep(0.10,0.28,tonalSpan);
  const ev=Math.max(EDITORIAL_FINISH.minEV,Math.min(EDITORIAL_FINISH.maxEV,requestedEV));
  const densityGate=smoothstep(EDITORIAL_FINISH.densityMedianLow,
    EDITORIAL_FINISH.densityMedianHigh,median)*smoothstep(0.12,0.28,tonalSpan);
  const densityGamma=1+(EDITORIAL_FINISH.densityGammaMax-1)*densityGate;
  const shadowGamma=1+(EDITORIAL_FINISH.shadowGammaMax-1)*densityGate;
  const vignetteStrength=EDITORIAL_FINISH.vignetteMin+
    (EDITORIAL_FINISH.vignetteMax-EDITORIAL_FINISH.vignetteMin)*smoothstep(0.28,0.62,sceneMid);
  let gainR=1,gainG=1,gainB=1;
  const rawWbWeight=coreWeight+tailWeight+warmTailWeight;
  if(rawWbWeight>Math.max(32,sampled*0.004)){
    /* As soon as reliable near-neutral evidence exists, it must define the
       illuminant: a large blue wall beside a grey shirt is not allowed to tint
       the shirt orange. Directional room votes fade continuously from their
       25% yellow/blue or 10% warm fallback authority to zero over 0.2–1.0%
       supported samples. */
    const coreSupport=smoothstep(
      Math.max(32,sampled*EDITORIAL_FINISH.wbCoreSupportStart),
      Math.max(128,sampled*EDITORIAL_FINISH.wbCoreSupportFull),coreWeight);
    const fallbackFade=1-coreSupport;
    const tailMix=EDITORIAL_FINISH.wbTailAuthority*fallbackFade;
    const warmTailMix=EDITORIAL_FINISH.wbWarmTailAuthority*fallbackFade;
    const wbWeight=coreWeight+tailMix*tailWeight+warmTailMix*warmTailWeight;
    const mr=(coreR+tailMix*tailR+warmTailMix*warmTailR)/wbWeight;
    const mg=(coreG+tailMix*tailG+warmTailMix*warmTailG)/wbWeight;
    const mb=(coreB+tailMix*tailB+warmTailMix*warmTailB)/wbWeight;
    const target=(mr+mg+mb)/3;
    const cast=(Math.max(mr,mg,mb)-Math.min(mr,mg,mb))/Math.max(1,target);
    /* Strongly coloured rooms are ambiguous: a blue wall is not a grey card.
       Tail-only evidence therefore receives limited authority; genuine
       near-neutral evidence unlocks the normal correction. */
    const evidenceWeight=coreWeight+fallbackFade*(tailWeight+warmTailWeight);
    const evidenceTrust=wbWeight/Math.max(1,evidenceWeight);
    const ramp=smoothstep(EDITORIAL_FINISH.wbDeadband,EDITORIAL_FINISH.wbFullCast,cast)*
      EDITORIAL_FINISH.wbStrength*evidenceTrust;
    if(ramp>0){
      gainR=Math.max(0.85,Math.min(1.15,1+(target/Math.max(1,mr)-1)*ramp));
      gainG=Math.max(0.85,Math.min(1.15,1+(target/Math.max(1,mg)-1)*ramp));
      gainB=Math.max(0.85,Math.min(1.15,1+(target/Math.max(1,mb)-1)*ramp));
      const preserve=LUMA[0]*gainR+LUMA[1]*gainG+LUMA[2]*gainB;
      gainR/=preserve;gainG/=preserve;gainB/=preserve;
      /* Luminance normalisation can otherwise push one channel beyond the
         nominal clamp. Scale all deviations together so hue direction and
         neutral luminance are both preserved within the hard gain ceiling. */
      const extent=Math.max(Math.abs(gainR-1),Math.abs(gainG-1),Math.abs(gainB-1));
      const limit=Math.min(1-EDITORIAL_FINISH.wbMin,EDITORIAL_FINISH.wbMax-1);
      if(extent>limit){
        const scale=limit/extent;
        gainR=1+(gainR-1)*scale;gainG=1+(gainG-1)*scale;gainB=1+(gainB-1)*scale;
      }
    }
  }
  return {ev,median,p10,p75,sceneMid,densityGamma,shadowGamma,vignetteStrength,gainR,gainG,gainB};
}

/* A per-render LUT keeps the expensive curve math out of the full pixel
   loop. Exposure adapts the midtones while protecting the opposite end of
   the range; the remaining moves are deliberately tiny. Over-range values
   left by a bright template grade are compressed back into the white point
   before the curve, rather than being clipped. */
const TONE_STEPS=4096;
function editorialToneLut(analysis){
  const lut=new Float32Array(TONE_STEPS),f=EDITORIAL_FINISH;
  const e=Math.pow(2,analysis.ev)-1;
  for(let i=0;i<TONE_STEPS;i++){
    let x=i/(TONE_STEPS-1)*ANALYSIS_MAX;
    const unit=clamp01(x);
    if(e>=0)x+=e*x*(1-smoothstep(0.72,1,unit));
    else x+=e*x*smoothstep(0.02,0.25,unit)*
      (1-0.92*smoothstep(0.72,0.98,unit));
    /* Adaptive density removes the phone-camera veil from healthy scenes,
       but fades to neutral in genuinely dark captures. */
    x=Math.pow(Math.max(0,x),analysis.densityGamma);
    /* A second, pivoted gamma gives healthy captures clean ink-black depth.
       It is continuous at the pivot, does not move ordinary midtones, and
       fades with the same scene-confidence gate in dark venues. */
    if(x<f.shadowPivot)x=f.shadowPivot*Math.pow(x/f.shadowPivot,analysis.shadowGamma);
    /* A soft shoulder only engages in the clean-white range. Unlike the old
       linear normalisation, ordinary white stays crisp while values pushed
       over range by the camera/template retain distinct highlight detail. */
    if(x>0.94)x=0.94+0.06*(1-Math.exp(-(x-0.94)/0.055));
    x=clamp01(x);
    x+=f.shadowLift*(1-smoothstep(0.02,0.20,x));
    x+=f.sCurve*(x-0.5)*4*x*(1-x);
    const shoulderBand=smoothstep(f.highlightStart,f.highlightPeak,x)*
      (1-0.88*smoothstep(f.highlightPeak,f.highlightEnd,x));
    x-=f.highlightShoulder*shoulderBand;
    x-=f.blackDensity*smoothstep(0.04,0.12,x)*(1-smoothstep(0.24,0.42,x));
    x+=f.whiteClean*smoothstep(0.78,0.96,x);
    x=f.matte+(1-f.matte)*x;
    lut[i]=Math.max(f.floor,Math.min(f.ceiling,x));
  }
  /* Tiny interactions between the shoulder and white clean-up must never
     invert two neighbouring input tones. */
  for(let i=1;i<TONE_STEPS;i++)if(lut[i]<lut[i-1])lut[i]=lut[i-1];
  return lut;
}

function boxBlurMap(src,w,h,radius){
  const tmp=new Float32Array(src.length),out=new Float32Array(src.length);
  for(let y=0;y<h;y++){
    const row=y*w;let sum=0,left=0,right=-1;
    for(let x=0;x<w;x++){
      const want=Math.min(w-1,x+radius);
      while(right<want)sum+=src[row+(++right)];
      const drop=x-radius;
      while(left<drop)sum-=src[row+(left++)];
      tmp[row+x]=sum/(right-left+1);
    }
  }
  for(let x=0;x<w;x++){
    let sum=0,top=0,bottom=-1;
    for(let y=0;y<h;y++){
      const want=Math.min(h-1,y+radius);
      while(bottom<want)sum+=tmp[(++bottom)*w+x];
      const drop=y-radius;
      while(top<drop)sum-=tmp[(top++)*w+x];
      out[y*w+x]=sum/(bottom-top+1);
    }
  }
  return out;
}
function localLumaMap(luma,w,h,requestedStep,radius){
  const step=requestedStep||Math.max(3,Math.min(5,Math.round(Math.min(w,h)/240)));
  const mw=Math.ceil(w/step),mh=Math.ceil(h/step),small=new Float32Array(mw*mh);
  for(let by=0;by<mh;by++)for(let bx=0;bx<mw;bx++){
    let sum=0,n=0;
    const y0=by*step,y1=Math.min(h,y0+step),x0=bx*step,x1=Math.min(w,x0+step);
    for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){sum+=luma[yy*w+xx];n++;}
    small[by*mw+bx]=sum/Math.max(1,n);
  }
  return {data:boxBlurMap(small,mw,mh,radius||2),width:mw,height:mh,step};
}
function sampleLocalLuma(map,x,y){
  const gx=Math.max(0,Math.min(map.width-1,(x+0.5)/map.step-0.5));
  const gy=Math.max(0,Math.min(map.height-1,(y+0.5)/map.step-0.5));
  const x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(map.width-1,x0+1),y1=Math.min(map.height-1,y0+1);
  const tx=gx-x0,ty=gy-y0;
  const a=map.data[y0*map.width+x0]*(1-tx)+map.data[y0*map.width+x1]*tx;
  const b=map.data[y1*map.width+x0]*(1-tx)+map.data[y1*map.width+x1]*tx;
  return a*(1-ty)+b*ty;
}

/* Zero-mean triangular noise, seeded once and repeated on a 128px tile.
   It is mixed as a 2.5% monochrome texture with a deliberately narrow tonal
   range: about one code value RMS, visible in a comparison but not as an
   effect. */
const GRAIN_SIZE=128;
let editorialGrain=null;
function editorialGrainTile(){
  if(editorialGrain)return editorialGrain;
  const tile=new Float32Array(GRAIN_SIZE*GRAIN_SIZE);let seed=0x6d2b79f5,mean=0,max=0;
  function random(){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return (seed>>>0)/4294967296;
  }
  for(let i=0;i<tile.length;i++){const v=random()+random()-1;tile[i]=v;mean+=v;}
  mean/=tile.length;
  for(let i=0;i<tile.length;i++){tile[i]-=mean;max=Math.max(max,Math.abs(tile[i]));}
  for(let i=0;i<tile.length;i++)tile[i]/=max||1;
  editorialGrain=tile;return tile;
}

/* A second, much quieter monochrome layer gives smooth walls and fabric the
   barely-there tooth of ink on coated stock. Periodic value noise keeps the
   tile seamless; its amplitude stays below one output code value, so it can
   never read as a paper overlay or alter colour. */
const PAPER_SIZE=256,PAPER_GRID=16;
let editorialPaper=null;
function editorialPaperTile(){
  if(editorialPaper)return editorialPaper;
  const grid=new Float32Array(PAPER_GRID*PAPER_GRID);
  const tile=new Float32Array(PAPER_SIZE*PAPER_SIZE);
  let seed=0x9e3779b9,mean=0,max=0;
  function random(){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return (seed>>>0)/4294967296-0.5;
  }
  for(let i=0;i<grid.length;i++)grid[i]=random();
  const cell=PAPER_SIZE/PAPER_GRID;
  for(let y=0;y<PAPER_SIZE;y++)for(let x=0;x<PAPER_SIZE;x++){
    const gx=x/cell,gy=y/cell,x0=Math.floor(gx),y0=Math.floor(gy);
    const x1=(x0+1)%PAPER_GRID,y1=(y0+1)%PAPER_GRID;
    const tx=smoothstep(0,1,gx-x0),ty=smoothstep(0,1,gy-y0);
    const a=grid[(y0%PAPER_GRID)*PAPER_GRID+x0]*(1-tx)+grid[(y0%PAPER_GRID)*PAPER_GRID+x1]*tx;
    const b=grid[y1*PAPER_GRID+x0]*(1-tx)+grid[y1*PAPER_GRID+x1]*tx;
    const v=a*(1-ty)+b*ty;
    tile[y*PAPER_SIZE+x]=v;mean+=v;
  }
  mean/=tile.length;
  for(let i=0;i<tile.length;i++){tile[i]-=mean;max=Math.max(max,Math.abs(tile[i]));}
  for(let i=0;i<tile.length;i++)tile[i]/=max||1;
  editorialPaper=tile;return tile;
}

const DETAIL_SCALE=4095;
function editorialFinish(ctx,x,y,w,h,gradeSpec){
  const ix=Math.max(0,Math.ceil(x)),iy=Math.max(0,Math.ceil(y));
  const iw=Math.min(ctx.canvas.width,Math.floor(x+w))-ix;
  const ih=Math.min(ctx.canvas.height,Math.floor(y+h))-iy;
  if(iw<=0||ih<=0)return;
  try{
    const image=ctx.getImageData(ix,iy,iw,ih),d=image.data;
    const grade=compileFloatGrade(gradeSpec),analysis=analyseEditorial(d);
    const tone=editorialToneLut(analysis),luma=new Uint16Array(iw*ih),f=EDITORIAL_FINISH;
    const gm=grade&&grade.m,go=grade&&grade.o;

    /* Tone and colour. Chroma is always rebuilt around luminance, and any
       out-of-gamut colour is pulled back toward that luminance as one vector;
       channels are never clipped independently, so hue stays put. */
    for(let p=0,i=0;i<d.length;i+=4,p++){
      /* Correct the capture before the template's tonal character. That keeps
         one skin/clothing rendering across all four covers. */
      const rawR=d[i],rawG=d[i+1],rawB=d[i+2];
      const rawHi=Math.max(rawR,rawG,rawB),rawLo=Math.min(rawR,rawG,rawB);
      const rawChroma=(rawHi-rawLo)/Math.max(20,rawHi);
      const warmWeight=warmPigmentWeight(rawR,rawG,rawB);
      /* Neutral surfaces receive the full scene correction. Coloured pixels
         retain most of their captured hue, and warm skin-like pigments retain
         still more, preventing a corrected room from turning skin ashy or
         quietly recolouring saturated clothes. This is colour gating only;
         it does not locate or alter a face. */
      const colourGate=smoothstep(0.055,0.18,rawChroma);
      const genericProtect=f.wbColourProtect+
        (f.wbSaturatedProtect-f.wbColourProtect)*smoothstep(0.18,0.45,rawChroma);
      const protectR=colourGate*(genericProtect+
        (f.wbWarmRedProtect-genericProtect)*warmWeight);
      const protectG=colourGate*(genericProtect+
        (f.wbWarmGreenProtect-genericProtect)*warmWeight);
      const protectB=colourGate*(genericProtect+
        (f.wbWarmBlueProtect-genericProtect)*warmWeight);
      const gainR=1+(analysis.gainR-1)*(1-protectR);
      const gainG=1+(analysis.gainG-1)*(1-protectG);
      const gainB=1+(analysis.gainB-1)*(1-protectB);
      let r=rawR*gainR,g=rawG*gainG,b=rawB*gainB;
      if(gm){
        const rr=gm[0]*r+gm[1]*g+gm[2]*b+go[0];
        const gg=gm[3]*r+gm[4]*g+gm[5]*b+go[1];
        const bb=gm[6]*r+gm[7]*g+gm[8]*b+go[2];
        r=rr;g=gg;b=bb;
      }
      r/=255;g/=255;b/=255;
      const sourceY=LUMA[0]*r+LUMA[1]*g+LUMA[2]*b;
      const ti=Math.max(0,Math.min(TONE_STEPS-1,Math.round(sourceY/ANALYSIS_MAX*(TONE_STEPS-1))));
      const targetY=tone[ti];
      const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
      const satMetric=clamp01((hi-lo)/Math.max(0.08,Math.abs(hi)));
      /* Follow large luminance moves with chroma so density does not turn
         skin or dark fabric burgundy. Vibrance then restores only the quiet
         colours, while a final shadow taper cleans near-black colour noise. */
      const toneChroma=Math.max(f.densityChromaFloor,
        Math.min(1.04,targetY/Math.max(0.04,sourceY)));
      const shadowChroma=f.shadowChroma+(1-f.shadowChroma)*smoothstep(0.035,0.16,targetY);
      const chromaScale=f.saturation*(1+f.vibrance*(1-satMetric))*toneChroma*shadowChroma;
      let dr=(r-sourceY)*chromaScale,dg=(g-sourceY)*chromaScale,db=(b-sourceY)*chromaScale,k=1;
      if(dr>0)k=Math.min(k,(f.ceiling-targetY)/dr);else if(dr<0)k=Math.min(k,(f.floor-targetY)/dr);
      if(dg>0)k=Math.min(k,(f.ceiling-targetY)/dg);else if(dg<0)k=Math.min(k,(f.floor-targetY)/dg);
      if(db>0)k=Math.min(k,(f.ceiling-targetY)/db);else if(db<0)k=Math.min(k,(f.floor-targetY)/db);
      if(k<1){dr*=k;dg*=k;db*=k;}
      d[i]=(targetY+dr)*255;d[i+1]=(targetY+dg)*255;d[i+2]=(targetY+db)*255;
      /* Twelve-bit working luma lets deliberately small detail moves survive
         the tone/colour staging write and reach the final detail write. */
      luma[p]=Math.round(targetY*DETAIL_SCALE);
    }

    const broad=localLumaMap(luma,iw,ih);
    const structureStep=Math.max(8,Math.min(12,Math.round(Math.min(iw,ih)/90)));
    const structure=localLumaMap(luma,iw,ih,structureStep,5);
    const noise=editorialGrainTile(),paper=editorialPaperTile();
    for(let py=0,p=0;py<ih;py++)for(let px=0;px<iw;px++,p++){
      const i=p*4,c=luma[p],xl=px?px-1:px,xr=px+1<iw?px+1:px;
      const yu=py?py-1:py,yd=py+1<ih?py+1:py;
      const n=luma[yu*iw+px],s=luma[yd*iw+px],e=luma[py*iw+xr],ww=luma[py*iw+xl];
      const nw=luma[yu*iw+xl],ne=luma[yu*iw+xr],sw=luma[yd*iw+xl],se=luma[yd*iw+xr];
      const gaussian=(4*c+2*(n+s+e+ww)+nw+ne+sw+se)/16;
      const cross=(n+s+e+ww)/4;
      const y0=c/DETAIL_SCALE,gaussDetail=(c-gaussian)/DETAIL_SCALE,crossDetail=(c-cross)/DETAIL_SCALE;
      const tonal=smoothstep(0.02,0.14,y0)*(1-0.45*smoothstep(0.82,0.985,y0));
      const nrStrength=f.noiseLight+(f.noiseShadow-f.noiseLight)*(1-smoothstep(0.22,0.62,y0));
      /* NR owns only the sub-texture noise band. Micro-contrast starts above
         it, so pores, hair and fabric are no longer smoothed and then added
         back by an equal amount. */
      const nrGate=1-smoothstep(0.004,0.018,Math.abs(gaussDetail));
      const textureGate=smoothstep(0.004,0.018,Math.abs(gaussDetail));
      const nrDelta=-gaussDetail*nrStrength*nrGate;
      const broadEdgeProtect=1-0.94*smoothstep(0.025,0.09,Math.abs(crossDetail));
      const local=(c-sampleLocalLuma(broad,px,py))/DETAIL_SCALE;
      let clarity=f.clarity*Math.max(-0.075,Math.min(0.075,local))*
        (1-smoothstep(0.075,0.16,Math.abs(local)))*
        broadEdgeProtect*tonal;
      const shape=(c-sampleLocalLuma(structure,px,py))/DETAIL_SCALE;
      let structureDelta=f.structureContrast*Math.max(-0.12,Math.min(0.12,shape))*
        (1-smoothstep(0.12,0.24,Math.abs(shape)))*
        broadEdgeProtect*tonal;
      /* Broad contrast must not turn a smooth cheek or other midtone plane
         into a dark patch simply because it sits beside a bright wall. The
         protection fades on genuine texture and edges, so hair, eyes and
         fabric keep the full dimensional treatment and no texture is blurred. */
      const planeProtect=smoothstep(0.07,0.18,y0)*(1-smoothstep(0.42,0.70,y0))*
        (1-smoothstep(0.006,0.024,Math.abs(gaussDetail)))*
        (1-smoothstep(0.020,0.070,Math.abs(crossDetail)));
      if(clarity<0)clarity*=1-f.clarityPlaneProtect*planeProtect;
      if(structureDelta<0)structureDelta*=1-f.structurePlaneProtect*planeProtect;
      const hardEdgeProtect=1-0.95*smoothstep(0.04,0.12,Math.abs(crossDetail));
      const micro=f.microContrast*Math.max(-0.03,Math.min(0.03,gaussDetail))*
        textureGate*hardEdgeProtect*tonal;
      const edgeGate=smoothstep(0.010,0.032,Math.abs(crossDetail));
      const pre=f.preSharpen*Math.max(-0.04,Math.min(0.04,crossDetail))*
        edgeGate*hardEdgeProtect*tonal;
      /* Coherent edges keep a strict two-code guard, while non-edge texture
         extrema may use up to four. This restores pores, hair and fabric
         without drawing a visible light/dark outline around clean contours. */
      const sobelX=((ne+2*e+se)-(nw+2*ww+sw))/(8*DETAIL_SCALE);
      const sobelY=((sw+2*s+se)-(nw+2*n+ne))/(8*DETAIL_SCALE);
      const sobelStrength=Math.hypot(sobelX,sobelY);
      const edgeFlow=sobelStrength/
        Math.max(1/DETAIL_SCALE,sobelStrength+Math.abs(crossDetail));
      const straightEdge=smoothstep(0.008,0.030,sobelStrength)*
        smoothstep(0.35,0.55,edgeFlow);
      const localAllowance=(2+2*(1-straightEdge))/255;
      const localMin=Math.min(c,n,s,e,ww,nw,ne,sw,se)/DETAIL_SCALE-localAllowance;
      const localMax=Math.max(c,n,s,e,ww,nw,ne,sw,se)/DETAIL_SCALE+localAllowance;
      /* Give wide tonal separation its own bounded lane. A 3x3 edge clamp is
         correct for micro-detail, but applying it to a 30–100px clarity map
         would erase the intended dimensional shaping on smooth skin, walls
         and fabric. The broad term is separately edge-masked and capped at
         five code values; the actual detail terms keep the tight local guard. */
      const proposedBroadDelta=Math.max(-f.broadDeltaCap,
        Math.min(f.broadDeltaCap,structureDelta+clarity));
      const br=f.broadGuardRadius,bxl=Math.max(0,px-br),bxr=Math.min(iw-1,px+br);
      const byu=Math.max(0,py-br),byd=Math.min(ih-1,py+br);
      const farW=luma[py*iw+bxl]/DETAIL_SCALE,farE=luma[py*iw+bxr]/DETAIL_SCALE;
      const farN=luma[byu*iw+px]/DETAIL_SCALE,farS=luma[byd*iw+px]/DETAIL_SCALE;
      const farMin=Math.min(y0,farW,farE,farN,farS),farMax=Math.max(y0,farW,farE,farN,farS);
      const broadDelta=Math.max(farMin,
        Math.min(farMax,y0+proposedBroadDelta))-y0;
      const detailY=Math.max(localMin,Math.min(localMax,y0+nrDelta+micro+pre));
      const cleanY=detailY+broadDelta;
      const vx=((px+0.5)/iw-0.5)/0.5;
      const vy=((py+0.5)/ih-0.5)/0.5;
      const radius2=0.5*(vx*vx+vy*vy);
      /* One canonical, very wide edge fall-off. The central 70% is untouched;
         side-centres receive only about a quarter of the already-low strength,
         and 7.5–9.5% is reached only in the extreme corners. Deep shadows get
         further protection so hair, clothing and dark skin retain separation. */
      const vignetteMask=smoothstep(f.vignetteInner,f.vignetteOuter,radius2);
      const shadowProtect=0.52+0.48*smoothstep(0.08,0.32,cleanY);
      const vignettedY=cleanY*(1-analysis.vignetteStrength*vignetteMask*shadowProtect);

      const grain=noise[((py+iy)&(GRAIN_SIZE-1))*GRAIN_SIZE+((px+ix)&(GRAIN_SIZE-1))];
      const grainWeight=0.55+0.45*4*clamp01(vignettedY)*(1-clamp01(vignettedY));
      const grainDelta=grain*f.grainOpacity*f.grainRange*grainWeight;
      const paperValue=paper[((py+iy)&(PAPER_SIZE-1))*PAPER_SIZE+((px+ix)&(PAPER_SIZE-1))];
      const paperWeight=0.35+0.65*4*clamp01(vignettedY)*(1-clamp01(vignettedY));
      const paperDelta=paperValue*f.paperTexture*paperWeight;
      /* Added after both texture layers, but based on the clean edge map:
         restore output definition without sharpening grain or colour noise. */
      const finalSharp=f.finalSharpen*Math.max(-0.10,Math.min(0.10,crossDetail))*
        edgeGate*hardEdgeProtect*tonal;
      const textureDelta=paperDelta+grainDelta;
      const vignetteLoss=cleanY-vignettedY;
      const guardedFinal=Math.max(localMin+broadDelta-vignetteLoss,
        Math.min(localMax+broadDelta-vignetteLoss,vignettedY+finalSharp))-vignettedY;
      const targetY=Math.max(f.floor,
        Math.min(f.ceiling,vignettedY+textureDelta+guardedFinal));

      const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
      const baseY=LUMA[0]*r+LUMA[1]*g+LUMA[2]*b;
      let dr=r-baseY,dg=g-baseY,db=b-baseY,k=1;
      if(dr>0)k=Math.min(k,(f.ceiling-targetY)/dr);else if(dr<0)k=Math.min(k,(f.floor-targetY)/dr);
      if(dg>0)k=Math.min(k,(f.ceiling-targetY)/dg);else if(dg<0)k=Math.min(k,(f.floor-targetY)/dg);
      if(db>0)k=Math.min(k,(f.ceiling-targetY)/db);else if(db<0)k=Math.min(k,(f.floor-targetY)/db);
      if(k<1){dr*=k;dg*=k;db*=k;}
      d[i]=(targetY+dr)*255;d[i+1]=(targetY+dg)*255;d[i+2]=(targetY+db)*255;
    }
    ctx.putImageData(image,ix,iy);
  }catch(e){
    /* A failed canvas read must be diagnosable on the booth rather than
       silently presenting an unfinished photograph as the final cover. */
    if(global.console&&console.warn)console.warn("Editorial finish skipped",e);
  }
}

/* Living Polaroid is outside this magazine-only request. Preserve its
   existing lightweight fixed pass so the change cannot unexpectedly alter
   already-authored video plates. */
const POLAROID_FINISH={exposure:1.02,contrast:1.06,saturation:0.96,grain:0.015};
let polaroidLut=null,printTile=null;
function polaroidToneLut(){
  if(polaroidLut)return polaroidLut;
  polaroidLut=new Float64Array(256);
  for(let v=0;v<256;v++)polaroidLut[v]=((v*POLAROID_FINISH.exposure-128)*POLAROID_FINISH.contrast)+128;
  return polaroidLut;
}
function printGrainTile(){
  if(printTile)return printTile;
  printTile=document.createElement("canvas");printTile.width=printTile.height=120;
  const g=printTile.getContext("2d");g.fillStyle="#000";
  for(let yy=0;yy<120;yy+=6)for(let xx=0;xx<120;xx+=6)if(Math.random()>0.65)g.fillRect(xx,yy,1,1);
  return printTile;
}
function polaroidFinish(ctx,x,y,w,h){
  const ix=Math.max(0,Math.ceil(x)),iy=Math.max(0,Math.ceil(y));
  const iw=Math.min(ctx.canvas.width,Math.floor(x+w))-ix;
  const ih=Math.min(ctx.canvas.height,Math.floor(y+h))-iy;
  if(iw<=0||ih<=0)return;
  try{
    const lut=polaroidToneLut(),sat=POLAROID_FINISH.saturation;
    const image=ctx.getImageData(ix,iy,iw,ih),d=image.data;
    for(let i=0;i<d.length;i+=4){
      const r=lut[d[i]],g=lut[d[i+1]],b=lut[d[i+2]],grey=(r+g+b)/3;
      d[i]=grey+(r-grey)*sat;d[i+1]=grey+(g-grey)*sat;d[i+2]=grey+(b-grey)*sat;
    }
    ctx.putImageData(image,ix,iy);
    const p=ctx.createPattern(printGrainTile(),"repeat");
    if(p){ctx.save();ctx.globalAlpha=POLAROID_FINISH.grain;ctx.fillStyle=p;ctx.fillRect(x,y,w,h);ctx.restore();}
  }catch(e){}
}

function paintPhoto(L,x,y,w,h,grade,anchorY){
  const {ctx}=L;
  ctx.save();
  ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.fillStyle="#0d0d0d";ctx.fillRect(x,y,w,h);
  if(L.img){
    drawPhotoCover(ctx,L.img,x,y,w,h,anchorY);
    /* Template tone and the house finish share one float pass so bright detail
       is not clipped between them. Scrims still measure the finished photo. */
    editorialFinish(ctx,x,y,w,h,grade);
  }
  ctx.restore();
}
function hairline(ctx,x,y,w,thick,alpha){
  ctx.save();ctx.globalAlpha=alpha===undefined?0.8:alpha;
  ctx.fillRect(x,y,w,Math.max(1,thick));ctx.restore();
}
function drawBarcode(ctx,x,y,w,h,caption){
  ctx.save();
  ctx.fillStyle="#ffffff";ctx.fillRect(x,y,w,h);
  const pad=w*0.05,top=y+h*0.13,barH=h*0.58,end=x+w-pad;
  let seed=7;for(const ch of String(caption||"026"))seed=(seed*31+ch.charCodeAt(0))%99991;
  let cx=x+pad;
  ctx.fillStyle="#111111";
  while(cx<end-1){
    seed=(seed*1103515245+12345)%2147483648;
    const bw=Math.max(1,1+(seed%3)*w*0.0055);
    const gap=Math.max(1,1+((seed>>7)%3)*w*0.005);
    if(cx+bw>end)break;
    ctx.fillRect(cx,top,bw,barH);
    cx+=bw+gap;
  }
  setFont(ctx,700,Math.max(7,h*0.18),FONT.sans);
  ctx.textAlign="center";
  ctx.fillText(String(caption||""),x+w/2,y+h-h*0.09);
  ctx.restore();
}

/* ---------- colour + ornament ---------- */

function hexRgb(hex){
  const h=String(hex||"").replace("#","");
  const f=h.length===3?h.split("").map(c=>c+c).join(""):h;
  const n=parseInt(f,16);
  return Number.isFinite(n)&&f.length===6?{r:(n>>16)&255,g:(n>>8)&255,b:n&255}:{r:216,g:108,b:143};
}
function lighten(hex,amount){
  const {r,g,b}=hexRgb(hex),m=(c)=>Math.round(c+(255-c)*amount);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function rgba(hex,a){
  const {r,g,b}=hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function heartPath(ctx,cx,cy,w,h){
  ctx.beginPath();
  ctx.moveTo(cx,cy+h*0.48);
  ctx.bezierCurveTo(cx-w*0.98,cy-h*0.12,cx-w*0.44,cy-h*0.74,cx,cy-h*0.2);
  ctx.bezierCurveTo(cx+w*0.44,cy-h*0.74,cx+w*0.98,cy-h*0.12,cx,cy+h*0.48);
  ctx.closePath();
}
function strokeHeart(ctx,cx,cy,w,h,color,lw){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineJoin="round";
  heartPath(ctx,cx,cy,w,h);ctx.stroke();ctx.restore();
}
function iconCamera(ctx,cx,cy,s,color,lw){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineJoin="round";
  const w=s,h=s*0.7,top=cy-h*0.38;
  ctx.strokeRect(cx-w/2,top,w,h);
  ctx.beginPath();
  ctx.moveTo(cx-w*0.24,top);ctx.lineTo(cx-w*0.16,top-s*0.14);
  ctx.lineTo(cx+w*0.16,top-s*0.14);ctx.lineTo(cx+w*0.24,top);
  ctx.stroke();
  ctx.beginPath();ctx.arc(cx,top+h*0.5,s*0.2,0,Math.PI*2);ctx.stroke();
  ctx.restore();
}
function iconSparkle(ctx,cx,cy,s,color,lw){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineJoin="round";
  ctx.beginPath();
  ctx.moveTo(cx,cy-s*0.52);
  ctx.quadraticCurveTo(cx+s*0.1,cy-s*0.1,cx+s*0.52,cy);
  ctx.quadraticCurveTo(cx+s*0.1,cy+s*0.1,cx,cy+s*0.52);
  ctx.quadraticCurveTo(cx-s*0.1,cy+s*0.1,cx-s*0.52,cy);
  ctx.quadraticCurveTo(cx-s*0.1,cy-s*0.1,cx,cy-s*0.52);
  ctx.closePath();ctx.stroke();ctx.restore();
}
/* Hand-drawn underline: a tapered sweep rather than a ruled line. */
function brushStroke(ctx,x,y,w,color){
  ctx.save();ctx.fillStyle=color;ctx.globalAlpha=0.92;
  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.quadraticCurveTo(x+w*0.48,y-w*0.022,x+w,y-w*0.004);
  ctx.lineTo(x+w,y+w*0.011);
  ctx.quadraticCurveTo(x+w*0.48,y+w*0.028,x,y+w*0.013);
  ctx.closePath();ctx.fill();ctx.restore();
}
/* "EDITION 14 OF 63" roundel — the guest's own numbered copy. */
function editionBadge(L,cx,cy,r,no,of,color,ink,words){
  const {ctx,u}=L;
  ctx.save();
  ctx.strokeStyle=rgba(color,0.75);ctx.lineWidth=1.6*u;
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=ink;
  setFont(ctx,700,r*0.19,FONT.sans);
  drawTracked(ctx,String((words&&words.edition)||"EDITION").toUpperCase(),cx,cy-r*0.34,r*0.19*0.18,"center");
  ctx.fillStyle=color;
  const nSize=fitTracked(ctx,String(no),r*1.1,r*0.62,FONT.serif,700,0.01,r*0.2);
  drawTracked(ctx,String(no),cx,cy+nSize*0.3,nSize*0.01,"center");
  ctx.fillStyle=ink;
  setFont(ctx,700,r*0.17,FONT.sans);
  if(of)drawTracked(ctx,(String((words&&words.of)||"OF")+" "+of).toUpperCase(),cx,cy+r*0.56,r*0.17*0.18,"center");
  strokeHeart(ctx,cx,cy+r*0.76,r*0.2,r*0.18,rgba(color,0.85),1.4*u);
  ctx.restore();
}
/* A vertical stack of small blocks that shrinks as one group if the
   column runs short — nothing overflows, nothing collides. */
function railStack(L,x,top,bottom,items){
  const {ctx}=L;
  const need=items.reduce((a,it)=>a+it.h+(it.gap||0),0);
  const scale=Math.min(1,(bottom-top)/Math.max(1,need));
  ctx.save();
  ctx.translate(x,top);
  if(scale<1)ctx.scale(scale,scale);
  let y=0;
  items.forEach(it=>{it.draw(y);y+=it.h+(it.gap||0);});
  ctx.restore();
}

/* A kicker + rule + sub-line unit. Returns the baseline it ended on. */
function featureBlock(L,o){
  const {ctx,u}=L;
  ctx.fillStyle=o.ink;
  const kick=fitBlock(ctx,(o.kicker||"").toUpperCase(),o.w,o.kickerSize||42*u,FONT.serif,400,0.035,o.kickerLines||3,15*u);
  const kLH=kick.size*1.03;
  drawLines(ctx,kick.lines,o.x,o.y,kLH,kick.track,o.align);
  let y=o.y+(kick.lines.length-1)*kLH;
  if(o.rule!==false){
    const rw=o.ruleW||52*u;
    y+=kick.size*0.44;                 /* clear the descenders */
    hairline(ctx,o.align==="right"?o.x-rw:o.align==="center"?o.x-rw/2:o.x,y,rw,1.4*u,0.72);
  }
  if(o.dek){
    const dek=fitBlock(ctx,o.dek.toUpperCase(),o.w,o.dekSize||15*u,FONT.sans,700,0.14,3,9*u);
    const dLH=dek.size*1.65;
    y+=(o.rule===false?kick.size*0.36:20*u)+dek.size;
    ctx.fillStyle=o.ink;
    drawLines(ctx,dek.lines,o.x,y,dLH,dek.track,o.align);
    y+=(dek.lines.length-1)*dLH;
  }
  return y;
}

/* ---------- templates ---------- */

function tplEditorial(L){
  const {ctx,W,H,u,M,land,copy}=L;
  const ink="#ffffff";
  paintPhoto(L,0,0,W,H,"contrast(1.04) brightness(1.01)",land?0.42:0.34);

  const topH=land?H*0.38:H*0.32,botH=land?H*0.46:H*0.44;
  bandScrim(L,"top",topH,adapt(edgeLuma(L,"top",topH*0.72),0.18,0.58));
  bandScrim(L,"bottom",botH,adapt(edgeLuma(L,"bottom",botH),0.24,0.68));
  bandScrim(L,"left",W*0.36,adapt(edgeLuma(L,"left",W*0.32),0.1,0.4));
  bandScrim(L,"right",W*0.32,adapt(edgeLuma(L,"right",W*0.3),0.06,0.36));
  ctx.fillStyle=ink;

  /* Masthead fills the measure; a short one leaves room for the skyline. */
  const short=(copy.masthead||"").replace(/\s+/g,"").length<=5;
  const skyW=(land?0.2:0.25)*W;
  const mastMax=short?W-2*M-skyW-0.035*W:W-2*M;
  const mSize=fitTracked(ctx,copy.masthead,mastMax,land?H*0.23:H*0.235,FONT.serif,700,0.012,26*u);
  const mBase=M+mSize*0.72;
  drawTracked(ctx,copy.masthead,M,mBase,mSize*0.012,"left");

  const sky=[copy.skyline1,copy.skyline2,copy.skyline3].filter(Boolean);
  const skySize=16*u,skyLH=27*u;
  setFont(ctx,700,skySize,FONT.sans);
  const skyTop=short?M+skySize+2*u:mBase+46*u;
  sky.forEach((t,i)=>drawTracked(ctx,t.toUpperCase(),W-M,skyTop+i*skyLH,skySize*0.2,"right"));

  const headBottom=Math.max(mBase,skyTop+Math.max(0,sky.length-1)*skyLH);
  const featTop=Math.max(headBottom+(land?70*u:88*u),H*(land?0.4:0.36));

  const colW=land?W*0.23:W*0.31;
  let leftBottom=featureBlock(L,{x:M,y:featTop,w:colW,align:"left",ink,
    kicker:copy.f1Title,dek:copy.f1Dek,kickerSize:land?40*u:48*u,dekSize:land?15*u:17*u});
  featureBlock(L,{x:W-M,y:featTop,w:land?W*0.21:W*0.27,align:"right",ink,
    kicker:copy.f2Title,dek:copy.f2Dek,kickerSize:land?36*u:42*u,dekSize:land?14*u:16*u});
  if(!land&&copy.f3Title){
    leftBottom=featureBlock(L,{x:M,y:leftBottom+66*u,w:colW,align:"left",ink,
      kicker:copy.f3Title,dek:copy.f3Dek,kickerSize:42*u,dekSize:16*u});
  }

  /* Bottom furniture, stacked upward from the trim. */
  const bottom=H-M;
  const bcW=land?170*u:180*u,bcH=54*u;
  drawBarcode(ctx,M,bottom-bcH,bcW,bcH,copy.barcode);
  ctx.fillStyle=ink;
  setFont(ctx,700,13*u,FONT.sans);
  drawTracked(ctx,(copy.footer||"").toUpperCase(),M,bottom-bcH-26*u,13*u*0.2,"left");
  if(copy.script){
    setFont(ctx,400,36*u,FONT.script);
    ctx.fillText(copy.script,M,bottom-bcH-64*u);
  }

  const dek=fitBlock(ctx,(copy.bigDek||"").toUpperCase(),land?W*0.34:W*0.5,16*u,FONT.sans,700,0.14,2,10*u);
  const dLH=dek.size*1.55;
  const dekLast=bottom-(land?16*u:12*u);
  const dekFirst=dekLast-(dek.lines.length-1)*dLH;

  const words=String(copy.big||"").trim().split(/\s+/).filter(Boolean);
  const bigLines=(!land&&words.length>1)?[words[0],words.slice(1).join(" ")]:[words.join(" ")];
  const bigMax=land?W*0.58:W*0.86;
  let bSize=land?H*0.19:H*0.155;
  bigLines.forEach(l=>{bSize=Math.min(bSize,fitTracked(ctx,l,bigMax,bSize,FONT.serif,700,0.008,28*u));});
  const limit=leftBottom+(land?36*u:30*u);
  let bigLast,bigTop;
  for(let i=0;i<40;i++){
    bigLast=dekFirst-(land?34*u:40*u);
    bigTop=bigLast-(bigLines.length-1)*bSize*0.94-bSize*0.72;
    if(bigTop>=limit||bSize<=40*u)break;
    bSize*=0.95;
  }
  setFont(ctx,700,bSize,FONT.serif);
  const bigW=bigLines.reduce((m,l)=>Math.max(m,trackedWidth(ctx,l,bSize*0.008)),0);
  plateIfBright(L,W-M-bigW,bigTop,bigW,bigLast-bigTop,0.5);
  setFont(ctx,700,bSize,FONT.serif);
  ctx.fillStyle=ink;
  bigLines.forEach((l,i)=>drawTracked(ctx,l,W-M,bigLast-(bigLines.length-1-i)*bSize*0.94,bSize*0.008,"right"));

  setFont(ctx,700,dek.size,FONT.sans);
  ctx.fillStyle=ink;
  drawLines(ctx,dek.lines,W-M,dekFirst,dLH,dek.track,"right");
}

function tplNoir(L){
  const {ctx,W,H,u,M,land,copy}=L;
  const ink="#f5f1ea";
  /* Noir keeps the photographed hues intact. Its drama comes from restrained
     tonal density, the layout and its scrims — never a clothing recolour. */
  paintPhoto(L,0,0,W,H,"contrast(1.07) brightness(0.985)",land?0.42:0.34);
  bandScrim(L,"top",H*0.36,adapt(edgeLuma(L,"top",H*0.26),0.3,0.66));
  bandScrim(L,"bottom",H*0.46,adapt(edgeLuma(L,"bottom",H*0.42),0.34,0.74));
  bandScrim(L,"left",W*0.34,adapt(edgeLuma(L,"left",W*0.3),0.12,0.46));
  bandScrim(L,"right",W*0.34,adapt(edgeLuma(L,"right",W*0.3),0.12,0.46));
  ctx.fillStyle=ink;

  const mSize=fitTracked(ctx,copy.masthead,W-2*M-(land?W*0.16:W*0.1),land?H*0.14:H*0.13,FONT.serif,700,0.09,24*u);
  const mBase=M+mSize*0.78;
  drawTracked(ctx,copy.masthead,W/2,mBase,mSize*0.09,"center");
  hairline(ctx,M,mBase+26*u,W-2*M,1.3*u,0.5);

  const sky=[copy.skyline1,copy.skyline2,copy.skyline3].filter(Boolean).join("   ·   ");
  setFont(ctx,700,13*u,FONT.sans);
  drawTracked(ctx,sky.toUpperCase(),W/2,mBase+56*u,13*u*0.28,"center");

  const featY=H*(land?0.44:0.42);
  featureBlock(L,{x:M,y:featY,w:land?W*0.2:W*0.26,align:"left",ink,
    kicker:copy.f1Title,dek:copy.f1Dek,kickerSize:land?32*u:34*u,kickerLines:3});
  featureBlock(L,{x:W-M,y:featY,w:land?W*0.2:W*0.26,align:"right",ink,
    kicker:copy.f2Title,dek:copy.f2Dek,kickerSize:land?32*u:34*u,kickerLines:3});

  const bottom=H-M;
  const bcW=land?150*u:158*u,bcH=48*u;
  drawBarcode(ctx,W-M-bcW,bottom-bcH,bcW,bcH,copy.barcode);
  ctx.fillStyle=ink;
  setFont(ctx,700,12*u,FONT.sans);
  drawTracked(ctx,(copy.footer||"").toUpperCase(),M,bottom-14*u,12*u*0.22,"left");

  const dek=fitBlock(ctx,(copy.bigDek||"").toUpperCase(),W*0.62,15*u,FONT.sans,700,0.16,2,10*u);
  const dLH=dek.size*1.6;
  const dekFirst=bottom-bcH-34*u-(dek.lines.length-1)*dLH;
  const bigSize=fitTracked(ctx,copy.big,W-2*M-(land?W*0.1:0),land?H*0.16:H*0.145,FONT.serif,700,0.02,30*u);
  const bigBase=dekFirst-46*u;
  drawTracked(ctx,copy.big,W/2,bigBase,bigSize*0.02,"center");
  hairline(ctx,W/2-W*0.13,bigBase-bigSize*0.72-34*u,W*0.26,1.3*u,0.55);
  setFont(ctx,700,dek.size,FONT.sans);
  drawLines(ctx,dek.lines,W/2,dekFirst,dLH,dek.track,"center");
}

/* The keepsake: a numbered edition for each guest. Left rail of event
   detail, didone masthead, condensed hero line, ornament set. */
function tplKeepsake(L){
  const {ctx,W,H,u,M,land,copy,accent,edition}=L;
  const ink="#ffffff";
  const soft=lighten(accent,0.34);
  const railW=land?W*0.26:W*0.31;

  paintPhoto(L,0,0,W,H,"contrast(1.05) brightness(0.99)",land?0.4:0.28);
  bandScrim(L,"left",railW+(land?W*0.18:W*0.24),adapt(regionLuma(ctx,0,0,railW,H),0.4,0.82));
  bandScrim(L,"top",H*0.3,adapt(edgeLuma(L,"top",H*0.2),0.2,0.52));
  bandScrim(L,"bottom",H*0.44,adapt(edgeLuma(L,"bottom",H*0.36),0.3,0.68));

  /* Printed frame */
  const fi=M*0.5;
  ctx.save();ctx.strokeStyle=rgba(accent,0.6);ctx.lineWidth=1.6*u;
  ctx.strokeRect(fi,fi,W-fi*2,H-fi*2);ctx.restore();

  const x=M,top=M+(land?12*u:20*u);

  /* Eyebrow — last line takes the accent, as on the reference */
  const eb=fitBlock(ctx,(copy.eyebrow||"").toUpperCase(),railW*1.05,land?22*u:26*u,FONT.sans,700,0.11,2,12*u);
  const ebLH=eb.size*1.5;
  eb.lines.forEach((l,i)=>{
    ctx.fillStyle=i===eb.lines.length-1&&eb.lines.length>1?accent:ink;
    setFont(ctx,700,eb.size,FONT.sans);
    drawTracked(ctx,l,x,top+eb.size*0.8+i*ebLH,eb.track,"left");
  });
  let y=top+eb.size*0.8+(eb.lines.length-1)*ebLH;
  y+=eb.size*0.9;
  ctx.fillStyle=rgba(accent,0.8);ctx.fillRect(x,y,railW*0.44,1.5*u);

  /* Masthead */
  const mSize=fitTracked(ctx,copy.masthead,land?W*0.34:W*0.46,land?H*0.24:H*0.21,FONT.serif,700,0.005,30*u);
  y+=mSize*0.86;
  ctx.fillStyle=ink;
  drawTracked(ctx,copy.masthead,x-mSize*0.02,y,mSize*0.005,"left");

  /* Stacked condensed lines under it, alternating accent and white */
  const stackWords=String(copy.stack||"").trim().split(/\s+/).filter(Boolean);
  if(stackWords.length){
    const longest=stackWords.reduce((a,b)=>a.length>=b.length?a:b);
    const sSize=fitTracked(ctx,longest.toUpperCase(),land?W*0.24:W*0.3,land?H*0.075:H*0.062,FONT.condensed,800,0.005,18*u);
    stackWords.forEach((wd,i)=>{
      y+=sSize*(i===0?1.05:0.98);
      ctx.fillStyle=i%2===0?accent:ink;
      setFont(ctx,800,sSize,FONT.condensed);
      drawTracked(ctx,wd.toUpperCase(),x,y,sSize*0.005,"left");
    });
  }

  /* Edition roundel */
  const bR=land?H*0.13:W*0.105;
  editionBadge(L,W-M-bR,M+bR*0.9,bR,edition&&edition.no||1,copy.editionOf,accent,ink,{edition:copy.editionWord,of:copy.ofWord});

  /* Left rail */
  const railTop=y+(land?34*u:48*u);
  const railBottom=H-M-(land?86*u:132*u);
  const rw=railW;
  const rule=(gap)=>({h:1.5*u,gap:gap===undefined?22*u:gap,draw(yy){ctx.fillStyle=rgba(accent,0.55);ctx.fillRect(0,yy,rw*0.5,1.5*u);}});
  const text=(t,size,weight,family,color,track,maxLines,gap)=>{
    const b=fitBlock(ctx,t,rw,size,family,weight,track,maxLines||2,size*0.34);
    const lh=b.size*1.34;
    return {h:b.lines.length*lh,gap:gap===undefined?20*u:gap,draw(yy){
      ctx.fillStyle=color;setFont(ctx,weight,b.size,family);
      drawLines(ctx,b.lines,0,yy+b.size*0.82,lh,b.track,"left");
    }};
  };
  const items=[];
  if(copy.dateLine)items.push(text(copy.dateLine,26*u,400,FONT.sans,ink,0.06,1,18*u));
  items.push(rule(20*u));
  if(copy.skyline1){
    const parts=String(copy.skyline1).toUpperCase().split(/\s+/);
    const head=parts[0],tail=parts.slice(1).join(" ");
    const sz=26*u;
    items.push({h:sz*1.2,gap:14*u,draw(yy){
      setFont(ctx,800,sz,FONT.sans);
      ctx.fillStyle=ink;
      const wA=drawTracked(ctx,head,0,yy+sz*0.82,sz*0.14,"left");
      if(tail){ctx.fillStyle=accent;drawTracked(ctx,tail,wA+sz*0.4,yy+sz*0.82,sz*0.14,"left");}
    }});
  }
  if(copy.f1Title)items.push(text(copy.f1Title.toUpperCase(),22*u,400,FONT.sans,ink,0.1,2,22*u));
  items.push(rule(24*u));
  if(copy.scriptSmall)items.push(text(copy.scriptSmall,36*u,400,FONT.script,accent,0,1,4*u));
  items.push(text(copy.masthead,54*u,700,FONT.serif,ink,0.02,1,24*u));
  items.push(rule(22*u));
  if(copy.footer)items.push(text(copy.footer.replace(/\s*[·|,]\s*/g,". ")+".",22*u,400,FONT.sans,ink,0.08,3,22*u));
  items.push({h:34*u,gap:26*u,draw(yy){strokeHeart(ctx,17*u,yy+17*u,30*u,30*u,rgba(accent,0.9),2*u);}});
  if(!land&&copy.thanks){
    const words=String(copy.thanks).split(/\s+/);
    items.push(text(words.slice(0,2).join(" ").toUpperCase(),20*u,700,FONT.sans,accent,0.1,1,4*u));
    items.push(text(words.slice(2).join(" ").toUpperCase(),20*u,400,FONT.sans,ink,0.09,2,22*u));
  }
  if(copy.hashtag)items.push(text(copy.hashtag.toUpperCase(),20*u,700,FONT.sans,accent,0.11,1,0));
  railStack(L,x,railTop,railBottom,items);

  /* Hero, bottom right */
  const heroWords=String(copy.hero||"").trim().split(/\s+/).filter(Boolean);
  const heroRight=W-M-(land?10*u:16*u);
  const heroMax=land?W*0.5:W*0.62;
  const iconTop=H-M-(land?58*u:76*u);
  let hSize=land?H*0.13:H*0.105;
  heroWords.forEach(wd=>{hSize=Math.min(hSize,fitTracked(ctx,wd.toUpperCase(),heroMax,hSize,FONT.condensed,800,0.005,24*u));});
  const heroLast=iconTop-(land?86*u:70*u);
  const heroFirst=heroLast-(heroWords.length-1)*hSize*0.92;

  if(copy.heroScript){
    const scSize=Math.min(hSize*0.62,land?H*0.075:H*0.058);
    setFont(ctx,400,scSize,FONT.script);
    const scW=ctx.measureText(copy.heroScript).width;
    ctx.save();
    ctx.translate(heroRight-scW*0.62,heroFirst-hSize*0.9-scSize*0.42);
    ctx.rotate(-0.055);
    ctx.fillStyle=ink;
    ctx.fillText(copy.heroScript,-scW/2,0);
    ctx.restore();
  }
  heroWords.forEach((wd,i)=>{
    setFont(ctx,800,hSize,FONT.condensed);
    ctx.fillStyle=i%2===0?soft:ink;
    drawTracked(ctx,wd.toUpperCase(),heroRight,heroFirst+i*hSize*0.92,hSize*0.005,"right");
  });
  if(heroWords.length){
    setFont(ctx,800,hSize,FONT.condensed);
    const lastW=trackedWidth(ctx,heroWords[heroWords.length-1].toUpperCase(),hSize*0.005);
    brushStroke(ctx,heroRight-lastW*0.92,heroLast+hSize*0.26,lastW*0.8,rgba(accent,0.85));
    strokeHeart(ctx,heroRight+4*u,heroLast-hSize*0.2,26*u,26*u,rgba(accent,0.9),2*u);
  }

  /* Icon strip */
  const labels=String(copy.icons||"").split(/\s*[,|]\s*/).filter(Boolean).slice(0,3);
  if(labels.length){
    const drawIcon=[iconCamera,(c,cx,cy,s,col,lw)=>strokeHeart(c,cx,cy,s*0.62,s*0.62,col,lw),iconSparkle];
    const stripL=x+railW*1.04,stripR=W-M-6*u;
    const cellW=(stripR-stripL)/labels.length;
    labels.forEach((raw,i)=>{
      const cx=stripL+cellW*i;
      const words=raw.trim().split(/\s+/);
      const l1=words[0]||"",l2=words.slice(1).join(" ");
      const s=land?26*u:30*u;
      drawIcon[i%3](ctx,cx+s*0.6,iconTop+s*0.5,s,rgba(accent,0.92),1.8*u);
      const tSize=land?15*u:17*u;
      setFont(ctx,700,tSize,FONT.sans);
      ctx.fillStyle=accent;
      drawTracked(ctx,l1.toUpperCase(),cx+s*1.5,iconTop+tSize*0.55,tSize*0.13,"left");
      ctx.fillStyle=ink;
      drawTracked(ctx,l2.toUpperCase(),cx+s*1.5,iconTop+tSize*2.05,tSize*0.13,"left");
      if(i){ctx.fillStyle=rgba(accent,0.4);ctx.fillRect(cx-cellW*0.06,iconTop-4*u,1.3*u,s*1.7);}
    });
  }
}

function tplPress(L){
  const {ctx,W,H,u,M,land,copy,accent,accentInk}=L;
  const ink="#ffffff",card="#141210";
  ctx.fillStyle=card;ctx.fillRect(0,0,W,H);

  const barW=land?W:W*0.2,barH=land?H*0.19:H;
  const px=land?0:barW,py=land?barH:0,pw=land?W:W-barW,ph=land?H-barH:H;
  paintPhoto(L,px,py,pw,ph,"contrast(1.04)",land?0.42:0.34);

  /* The whole lower half of the photo is type, so the base has to carry it. */
  const baseH=ph*(land?0.72:0.56);
  const baseA=adapt(regionLuma(ctx,px,py+ph-baseH,pw,baseH),0.62,0.94);
  ctx.save();ctx.beginPath();ctx.rect(px,py,pw,ph);ctx.clip();
  const g=ctx.createLinearGradient(0,py+ph,0,py+ph-baseH);
  g.addColorStop(0,`rgba(10,9,8,${baseA})`);
  g.addColorStop(0.42,`rgba(10,9,8,${baseA*0.55})`);
  g.addColorStop(1,"rgba(10,9,8,0)");
  ctx.fillStyle=g;ctx.fillRect(px,py,pw,ph);
  ctx.restore();
  plateIfBright(L,px+M*0.4,py+ph-ph*0.36,Math.min(pw*0.82,pw-M),ph*0.32,0.55);

  ctx.fillStyle=card;ctx.fillRect(0,0,barW,barH);

  /* Accent chip carries the issue line; masthead runs the length of the bar. */
  const chip=land?{x:W-W*0.22,y:0,w:W*0.22,h:barH}:{x:0,y:H*0.055,w:barW,h:H*0.17};
  ctx.fillStyle=accent;ctx.fillRect(chip.x,chip.y,chip.w,chip.h);
  ctx.fillStyle=accentInk;
  const chipText=[copy.skyline1,copy.skyline2].filter(Boolean).join(" · ").toUpperCase();
  setFont(ctx,800,14*u,FONT.sans);
  if(land)drawTracked(ctx,chipText,chip.x+chip.w/2,chip.y+chip.h/2+5*u,14*u*0.2,"center");
  else{
    ctx.save();ctx.translate(chip.x+chip.w/2,chip.y+chip.h/2);ctx.rotate(-Math.PI/2);
    drawTracked(ctx,chipText,0,5*u,14*u*0.2,"center");ctx.restore();
  }

  ctx.fillStyle=ink;
  if(land){
    const mSize=fitTracked(ctx,copy.masthead,W-2*M-chip.w-W*0.04,barH*0.62,FONT.sans,800,0.06,24*u);
    drawTracked(ctx,copy.masthead.toUpperCase(),M,barH/2+mSize*0.36,mSize*0.06,"left");
  }else{
    const run=H-chip.y-chip.h-M*2;
    const mSize=fitTracked(ctx,copy.masthead,run,barW*0.66,FONT.sans,800,0.06,24*u);
    ctx.save();
    ctx.translate(barW/2+mSize*0.34,chip.y+chip.h+M+run/2);
    ctx.rotate(-Math.PI/2);
    drawTracked(ctx,copy.masthead.toUpperCase(),0,0,mSize*0.06,"center");
    ctx.restore();
  }

  /* Name + standfirst sit on the photo's dark base, stacked from the trim up. */
  const inX=px+(land?M:M*0.8),inW=pw-(land?M*2:M*1.6);
  const bottom=py+ph-(land?M*0.9:M*0.8);
  ctx.fillStyle=ink;
  setFont(ctx,800,14*u,FONT.sans);
  drawTracked(ctx,(copy.footer||"").toUpperCase(),inX,bottom,14*u*0.22,"left");

  const dek=fitBlock(ctx,copy.bigDek||"",Math.min(inW,land?W*0.42:W*0.68),17*u,FONT.sans,400,0.02,3,10*u);
  const dLH=dek.size*1.55;
  const dekFirst=bottom-42*u-(dek.lines.length-1)*dLH;
  ctx.fillStyle=ink;
  drawLines(ctx,dek.lines,inX,dekFirst,dLH,dek.track,"left");

  const nameSize=fitTracked(ctx,copy.big,inW,land?H*0.1:H*0.082,FONT.sans,800,0.02,24*u);
  const nameBase=dekFirst-dek.size-30*u;
  ctx.fillStyle=ink;
  drawTracked(ctx,String(copy.big||"").toUpperCase(),inX,nameBase,nameSize*0.02,"left");

  const kickSize=17*u;
  setFont(ctx,800,kickSize,FONT.sans);
  ctx.fillStyle=accent;
  const kickBase=nameBase-nameSize*0.78-26*u;
  drawTracked(ctx,(copy.f1Title||"").toUpperCase(),inX,kickBase,kickSize*0.22,"left");
  ctx.fillRect(inX,kickBase+kickSize*0.5,52*u,2*u);
}

const RENDERERS={keepsake:tplKeepsake,editorial:tplEditorial,noir:tplNoir,press:tplPress};

/* A small publisher slug is part of the exported cover, not an HTML
   watermark. The anchor changes with the template so it reads as magazine
   furniture rather than a sticker dropped over the photograph. */
function brandingLabel(branding){
  if(!branding)return "";
  return String(branding.text||branding.myBishBashText||branding.brandName||"").trim();
}
function colourLuminance(value){
  const m=String(value||"").match(/^#([0-9a-f]{6})$/i);
  if(!m)return 1;
  const n=parseInt(m[1],16);
  const channels=[n>>16&255,n>>8&255,n&255].map(channel=>channel/255)
    .map(channel=>channel<=0.03928?channel/12.92:Math.pow((channel+0.055)/1.055,2.4));
  return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];
}
function contrastRatio(first,second){
  const a=colourLuminance(first),b=colourLuminance(second);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
function safeForeground(background){
  return contrastRatio(background,"#111111")>=contrastRatio(background,"#ffffff")?"#111111":"#ffffff";
}
function drawOutputBranding(ctx,L,branding,template){
  if(!branding)return;
  const label=brandingLabel(branding),logo=branding.logoImage||null;
  if(!label&&!logo)return;

  const u=L.u,W=L.W,H=L.H,M=L.M;
  const mode=String(branding.mode||"");
  const business=/business|white/i.test(mode);
  const bg=business?(branding.primaryColor||"#171412"):"#fffdf8";
  const fg=safeForeground(bg);
  const textColour=business?fg:"#111";
  const accent=branding.secondaryColor||L.accent||"#d86c8f";
  const fontSize=Math.max(8,11*u),padX=Math.max(7,10*u);
  const h=Math.max(20,31*u),logoH=logo?h-Math.max(7,10*u):0;
  let logoW=0;
  if(logo){
    const iw=logo.naturalWidth||logo.width||1,ih=logo.naturalHeight||logo.height||1;
    logoW=Math.min(Math.max(30*u,logoH*iw/Math.max(1,ih)),120*u);
  }
  setFont(ctx,800,fontSize,FONT.sans);
  const text=label.toUpperCase();
  const textW=text?trackedWidth(ctx,text,fontSize*.12):0;
  const w=Math.min(W-M*.8,Math.max(70*u,padX*2+textW+(logoW?(logoW+padX):0)));
  let x=M*.55;
  if(template==="editorial")x=W-M*.55-w;
  else if(template==="noir")x=(W-w)/2;
  else if(template==="press")x=L.land?W-M*.55-w:M*.55;
  const y=H-M*.28-h;

  ctx.save();
  ctx.globalAlpha=.94;
  ctx.fillStyle=bg;ctx.fillRect(x,y,w,h);
  ctx.globalAlpha=1;
  ctx.fillStyle=accent;ctx.fillRect(x,y,Math.max(3,4*u),h);
  let tx=x+padX;
  if(logo){
    try{
      ctx.drawImage(logo,tx,y+(h-logoH)/2,logoW,logoH);
      tx+=logoW+padX;
    }catch(e){}
  }
  if(text){
    ctx.fillStyle=textColour;
    setFont(ctx,800,fontSize,FONT.sans);
    drawTracked(ctx,text,tx,y+h/2+fontSize*.34,fontSize*.12,"left");
  }
  ctx.restore();
}

function render(ctx,opts){
  if(opts.fonts)Object.assign(FONT,opts.fonts);
  const W=opts.width,H=opts.height;
  const accent=opts.accent||"#d86c8f";
  const L={
    ctx,W,H,
    u:Math.min(W,H)/1200,
    M:Math.round(Math.min(W,H)*0.062),
    land:W>H,
    img:opts.img||null,
    copy:opts.copy,
    accent,
    accentInk:opts.accentInk||safeForeground(accent),
    edition:opts.edition||{no:1}
  };
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.textBaseline="alphabetic";
  ctx.textAlign="left";
  (RENDERERS[opts.template]||tplKeepsake)(L);
  drawOutputBranding(ctx,L,opts.branding,opts.template||"keepsake");
  ctx.restore();
}

/* Stand-in "photo" so the admin preview shows the real renderer. */
let placeholderCanvas=null;
function placeholder(){
  if(placeholderCanvas)return placeholderCanvas;
  const c=document.createElement("canvas");c.width=1200;c.height=1500;
  const x=c.getContext("2d");
  const g=x.createLinearGradient(0,0,0,1500);
  g.addColorStop(0,"#cfc4b6");g.addColorStop(0.55,"#b3a596");g.addColorStop(1,"#6f6559");
  x.fillStyle=g;x.fillRect(0,0,1200,1500);
  x.fillStyle="rgba(60,50,42,.42)";
  x.beginPath();x.ellipse(600,560,215,265,0,0,Math.PI*2);x.fill();
  x.beginPath();x.ellipse(600,1320,430,520,0,0,Math.PI*2);x.fill();
  placeholderCanvas=c;
  return c;
}

/* The Polaroid keeps its existing lightweight finish; the adaptive editorial
   pass is exported separately for cover tests and future magazine layouts. */
global.Covers={TEMPLATES,RATIO,coverSize,derive,copyFor,copyKeys:COPY_KEYS,render,placeholder,FONT,
  editorialFinish,polaroidFinish,applyGrade,drawPhotoCover,firstName,eventAge,ordinal,heartPath};
})(window);
