/* strip.js — canonical MyBishBash Photo Strip renderer.

   A fixed 2:6 print-style output. The same geometry is intended for the live
   preview, saved/shared PNG and a future 300dpi physical print: three equal
   photographs, narrow separators and one controlled footer. Finished guest
   outputs keep the photographs clear, and frame treatments never change
   their size; only an optional draft SAMPLE watermark sits above them. */
(function(root,factory){
"use strict";
const api=factory();
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(root)root.Strip=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";

const WIDTH=600;
const HEIGHT=1800;
const OUTER_BORDER=18;
const PHOTO_GAP=12;
const PHOTO_HEIGHT=504;
const FOOTER_GAP=12;
const FOOTER_HEIGHT=216;
const DRAFT_LABEL="SAMPLE";
const DRAFT_ANGLE=-Math.PI/6;
const DRAFT_OPACITY=.18;

const DEFAULT_FONTS=Object.freeze({
  serif:'Didot,"Bodoni 72","Playfair Display",Georgia,"Times New Roman",serif',
  sans:'"Avenir Next",Avenir,"Helvetica Neue",Helvetica,Arial,sans-serif',
  script:'"Snell Roundhand","Apple Chancery","Segoe Script","Brush Script MT",cursive'
});

const FRAME_STYLES=Object.freeze({
  white:Object.freeze({background:"#ffffff",ink:"#111111",photoBackground:"#f2f2f2"}),
  black:Object.freeze({background:"#090909",ink:"#ffffff",photoBackground:"#151515"}),
  editorial:Object.freeze({background:"#f7f0e5",ink:"#111111",photoBackground:"#eee7dd"}),
  film:Object.freeze({background:"#090909",ink:"#ffffff",photoBackground:"#151515"})
});

function rect(x,y,w,h){return {x:x,y:y,w:w,h:h};}
function cloneRect(value){return rect(value.x,value.y,value.w,value.h);}

function createGeometry(){
  const photoWidth=WIDTH-OUTER_BORDER*2;
  const slots=[];
  for(let index=0;index<3;index++){
    slots.push(rect(
      OUTER_BORDER,
      OUTER_BORDER+index*(PHOTO_HEIGHT+PHOTO_GAP),
      photoWidth,
      PHOTO_HEIGHT
    ));
  }
  const footerY=slots[2].y+PHOTO_HEIGHT+FOOTER_GAP;
  const footer=rect(OUTER_BORDER,footerY,photoWidth,FOOTER_HEIGHT);
  footer.event=rect(42,footerY+18,516,104);
  footer.divider=rect(84,footerY+131,432,2);
  footer.branding=rect(42,footerY+141,516,46);
  footer.logoMax=rect(42,footerY+148,96,32);
  footer.brandText=rect(152,footerY+141,406,46);
  return {
    width:WIDTH,
    height:HEIGHT,
    outerBorder:OUTER_BORDER,
    photoGap:PHOTO_GAP,
    footerGap:FOOTER_GAP,
    slots:slots,
    footer:footer
  };
}

/* Return a fresh value so consumer code cannot accidentally change the
   canonical coordinates for a later render. */
function geometry(){
  const value=createGeometry();
  const footer=cloneRect(value.footer);
  footer.event=cloneRect(value.footer.event);
  footer.divider=cloneRect(value.footer.divider);
  footer.branding=cloneRect(value.footer.branding);
  footer.logoMax=cloneRect(value.footer.logoMax);
  footer.brandText=cloneRect(value.footer.brandText);
  return {
    width:value.width,
    height:value.height,
    outerBorder:value.outerBorder,
    photoGap:value.photoGap,
    footerGap:value.footerGap,
    slots:value.slots.map(cloneRect),
    footer:footer
  };
}

function finitePositive(value,name){
  const number=Number(value);
  if(!Number.isFinite(number)||number<=0)throw new TypeError(name+" must be a positive finite number");
  return number;
}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}

/* Source rectangle for an undistorted cover crop. Optional focal coordinates
   are normalised from 0..1; their result is still clamped to the photograph. */
function coverCrop(sourceWidth,sourceHeight,destination,focalPoint){
  const sw=finitePositive(sourceWidth,"sourceWidth");
  const sh=finitePositive(sourceHeight,"sourceHeight");
  const dw=finitePositive(destination&&destination.w,"destination.w");
  const dh=finitePositive(destination&&destination.h,"destination.h");
  const scale=Math.max(dw/sw,dh/sh);
  const cropW=dw/scale;
  const cropH=dh/scale;
  const fx=clamp(Number(focalPoint&&focalPoint.x),0,1);
  const fy=clamp(Number(focalPoint&&focalPoint.y),0,1);
  const focusX=Number.isFinite(fx)?fx:0.5;
  const focusY=Number.isFinite(fy)?fy:0.5;
  const sx=clamp(sw*focusX-cropW/2,0,sw-cropW);
  const sy=clamp(sh*focusY-cropH/2,0,sh-cropH);
  return {
    sx:sx,sy:sy,sw:cropW,sh:cropH,
    dx:destination.x,dy:destination.y,dw:dw,dh:dh,
    scale:scale
  };
}

/* Destination rectangle for a contained logo or other asset. */
function containRect(sourceWidth,sourceHeight,destination){
  const sw=finitePositive(sourceWidth,"sourceWidth");
  const sh=finitePositive(sourceHeight,"sourceHeight");
  const dw=finitePositive(destination&&destination.w,"destination.w");
  const dh=finitePositive(destination&&destination.h,"destination.h");
  const scale=Math.min(dw/sw,dh/sh);
  const w=sw*scale,h=sh*scale;
  return {
    x:destination.x+(dw-w)/2,
    y:destination.y+(dh-h)/2,
    w:w,h:h,scale:scale
  };
}

function imageSize(image){
  if(!image)return null;
  const width=Number(image.naturalWidth||image.videoWidth||image.width);
  const height=Number(image.naturalHeight||image.videoHeight||image.height);
  return Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0?{width:width,height:height}:null;
}

function frameStyle(name){return FRAME_STYLES[name]||FRAME_STYLES.white;}

function firstText(){
  for(let index=0;index<arguments.length;index++){
    if(typeof arguments[index]==="string"&&arguments[index].trim())return arguments[index].trim();
  }
  return "";
}

function footerCopy(options){
  const opts=options||{},footer=opts.footer||{},copy=opts.copy||{},event=opts.event||{};
  const name=firstText(
    footer.primary,footer.eventName,copy.signature,copy.second,
    event.name,event.eventName,opts.eventName
  );
  const location=firstText(footer.location,event.location,opts.location);
  const date=firstText(footer.date,copy.date,event.displayDate,event.date,opts.date);
  return {
    primary:name,
    secondary:firstText(footer.secondary,location&&date?location+" · "+date:"",location,date),
    primaryStyle:firstText(footer.primaryStyle,event.footerStyle)||"script"
  };
}

function brandingLabel(branding){
  const value=branding||{};
  return firstText(value.text,value.myBishBashText,value.brandName,value.businessName);
}

/* The logo's maximum box is immutable. With a label it stays left of the
   label; by itself it centres in the same footer branding band. */
function brandingLayout(branding,geo){
  const value=branding||{},g=geo||geometry(),logo=value.logoImage||value.logo||null;
  const size=imageSize(logo),label=brandingLabel(value);
  let logoBounds=cloneRect(g.footer.logoMax),textBounds=cloneRect(g.footer.brandText);
  if(size&&!label){
    logoBounds.x=g.footer.branding.x+(g.footer.branding.w-logoBounds.w)/2;
    textBounds=rect(g.footer.branding.x,g.footer.branding.y,0,g.footer.branding.h);
  }else if(!size){
    logoBounds=rect(g.footer.logoMax.x,g.footer.logoMax.y,0,0);
    textBounds=cloneRect(g.footer.branding);
  }
  return {
    label:label,
    logo:logo,
    logoBounds:logoBounds,
    logoRect:size?containRect(size.width,size.height,logoBounds):null,
    textBounds:textBounds
  };
}

function fontFamily(fonts,role){
  if(role==="sans"||role==="serif"||role==="script")return fonts[role];
  return fonts.script;
}

function setFont(ctx,weight,size,family){ctx.font=weight+" "+Math.max(1,Math.round(size*10)/10)+"px "+family;}
function fitLine(ctx,text,maxWidth,startSize,minSize,family,weight){
  let size=startSize;
  setFont(ctx,weight,size,family);
  while(size>minSize&&ctx.measureText(text).width>maxWidth){
    size=Math.max(minSize,size-1);
    setFont(ctx,weight,size,family);
  }
  if(ctx.measureText(text).width<=maxWidth)return {size:size,text:text};
  let output=String(text||"");
  while(output.length>1&&ctx.measureText(output+"…").width>maxWidth)output=output.slice(0,-1);
  return {size:size,text:output+(output===text?"":"…")};
}

function drawFooter(ctx,options,style,geo){
  const opts=options||{},copy=footerCopy(opts),fonts=Object.assign({},DEFAULT_FONTS,opts.fonts||opts.typography||{});
  const accent=opts.accent||(opts.branding&&opts.branding.secondaryColor)||style.ink;
  const brand=brandingLayout(opts.branding,geo);

  ctx.save();
  ctx.fillStyle=style.ink;
  ctx.textAlign="center";
  ctx.textBaseline="alphabetic";

  if(copy.primary){
    const family=fontFamily(fonts,copy.primaryStyle);
    const fitted=fitLine(ctx,copy.primary,geo.footer.event.w,44,22,family,copy.primaryStyle==="sans"?700:400);
    ctx.fillText(fitted.text,geo.width/2,copy.secondary?geo.footer.event.y+51:geo.footer.event.y+68);
  }
  if(copy.secondary){
    const fitted=fitLine(ctx,copy.secondary.toUpperCase(),geo.footer.event.w,18,11,fonts.sans,700);
    ctx.globalAlpha=.72;
    ctx.fillText(fitted.text,geo.width/2,geo.footer.event.y+93);
    ctx.globalAlpha=1;
  }

  if(brand.label||brand.logoRect){
    ctx.globalAlpha=.55;
    ctx.fillStyle=accent;
    ctx.fillRect(geo.footer.divider.x,geo.footer.divider.y,geo.footer.divider.w,geo.footer.divider.h);
    ctx.globalAlpha=1;

    if(brand.logoRect){
      const dark=style===FRAME_STYLES.black||style===FRAME_STYLES.film;
      const requested=opts.branding&&opts.branding.logoBackgroundColor;
      const background=requested===false?null:(requested||((dark&&opts.branding.logoTone!=="light")?"#ffffff":null));
      if(background){
        ctx.fillStyle=background;
        ctx.fillRect(brand.logoBounds.x-4,brand.logoBounds.y-3,brand.logoBounds.w+8,brand.logoBounds.h+6);
      }
      try{ctx.drawImage(brand.logo,brand.logoRect.x,brand.logoRect.y,brand.logoRect.w,brand.logoRect.h);}catch(error){}
    }

    if(brand.label&&brand.textBounds.w>0){
      const fitted=fitLine(ctx,brand.label.toUpperCase(),brand.textBounds.w,14,9,fonts.sans,800);
      ctx.fillStyle=style.ink;
      ctx.globalAlpha=.78;
      ctx.textAlign=brand.logoRect?"left":"center";
      const x=brand.logoRect?brand.textBounds.x:brand.textBounds.x+brand.textBounds.w/2;
      ctx.fillText(fitted.text,x,brand.textBounds.y+30);
      ctx.globalAlpha=1;
    }
  }
  ctx.restore();
  return {copy:copy,branding:brand};
}

/* The sample treatment is deliberately rendered after photographs, grading,
   event copy and branding. A custom drawPhoto/grade hook therefore cannot
   accidentally cover it, and preview/export stay identical. One quiet,
   diagonal watermark per photograph keeps the preview unmistakable without
   adding a banner, border or block of colour to the finished design. */
function drawDraftTreatment(ctx,geo){
  const stampWidth=300,stampHeight=84;
  const stamps=geo.slots.map(function(slot){
    return rect(
      slot.x+(slot.w-stampWidth)/2,
      slot.y+(slot.h-stampHeight)/2,
      stampWidth,
      stampHeight
    );
  });
  ctx.save();
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  setFont(ctx,900,72,DEFAULT_FONTS.sans);
  stamps.forEach(function(stamp){
    ctx.save();
    ctx.translate(stamp.x+stamp.w/2,stamp.y+stamp.h/2);
    ctx.rotate(DRAFT_ANGLE);
    ctx.globalAlpha=DRAFT_OPACITY;
    ctx.lineWidth=5;
    ctx.strokeStyle="#ffffff";
    if(typeof ctx.strokeText==="function")ctx.strokeText(DRAFT_LABEL,0,0);
    ctx.fillStyle="#111111";
    ctx.fillText(DRAFT_LABEL,0,0);
    ctx.restore();
  });
  ctx.restore();
  return {enabled:true,label:DRAFT_LABEL,stamps:stamps,outline:null,opacity:DRAFT_OPACITY,angle:DRAFT_ANGLE};
}

function drawPhoto(ctx,image,index,slot,options){
  const size=imageSize(image);
  const style=frameStyle(options.frameStyle);
  ctx.fillStyle=style.photoBackground;
  ctx.fillRect(slot.x,slot.y,slot.w,slot.h);
  if(!size)return null;

  const focalPoints=options.focalPoints||[];
  const crop=coverCrop(size.width,size.height,slot,focalPoints[index]);
  const details={ctx:ctx,image:image,index:index,source:{x:crop.sx,y:crop.sy,w:crop.sw,h:crop.sh},destination:cloneRect(slot),filterStyle:options.filterStyle};
  ctx.save();
  if(typeof ctx.beginPath==="function"&&typeof ctx.rect==="function"&&typeof ctx.clip==="function"){
    ctx.beginPath();ctx.rect(slot.x,slot.y,slot.w,slot.h);ctx.clip();
  }
  if(typeof options.drawPhoto==="function")options.drawPhoto(details);
  else ctx.drawImage(image,crop.sx,crop.sy,crop.sw,crop.sh,crop.dx,crop.dy,crop.dw,crop.dh);
  if(typeof options.grade==="function")options.grade(details);
  ctx.restore();
  return crop;
}

function render(ctx,options){
  if(!ctx)throw new TypeError("A 2D canvas context is required");
  const opts=options||{},geo=geometry(),style=frameStyle(opts.frameStyle);
  const canvas=opts.canvas||ctx.canvas;
  if(canvas){canvas.width=geo.width;canvas.height=geo.height;}

  ctx.save();
  if(typeof ctx.setTransform==="function")ctx.setTransform(1,0,0,1,0,0);
  if(typeof ctx.clearRect==="function")ctx.clearRect(0,0,geo.width,geo.height);
  ctx.fillStyle=style.background;
  ctx.fillRect(0,0,geo.width,geo.height);

  const images=opts.images||[];
  const crops=geo.slots.map(function(slot,index){return drawPhoto(ctx,images[index],index,slot,opts);});
  const footer=drawFooter(ctx,opts,style,geo);

  /* Editorial and film remain colour treatments, not alternate layouts. A
     restrained trim line gives those legacy options a finish without taking
     a single pixel from a photograph. */
  if((opts.frameStyle==="editorial"||opts.frameStyle==="film")&&typeof ctx.strokeRect==="function"){
    ctx.strokeStyle=style.ink;
    ctx.globalAlpha=.22;
    ctx.lineWidth=1;
    ctx.strokeRect(8.5,8.5,geo.width-17,geo.height-17);
    ctx.globalAlpha=1;
  }
  const draft=opts.draft?drawDraftTreatment(ctx,geo):{enabled:false,label:DRAFT_LABEL,stamps:[],outline:null};
  ctx.restore();
  return {
    width:geo.width,
    height:geo.height,
    frameStyle:FRAME_STYLES[opts.frameStyle]?opts.frameStyle:"white",
    geometry:geo,
    crops:crops,
    footer:footer,
    draft:draft
  };
}

return {
  WIDTH:WIDTH,
  HEIGHT:HEIGHT,
  DRAFT_LABEL:DRAFT_LABEL,
  FRAME_STYLES:FRAME_STYLES,
  DEFAULT_FONTS:DEFAULT_FONTS,
  geometry:geometry,
  coverCrop:coverCrop,
  containRect:containRect,
  footerCopy:footerCopy,
  brandingLayout:brandingLayout,
  render:render
};
});
