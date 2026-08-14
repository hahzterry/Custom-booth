/* marketing.js — real-product demonstrations for the public landing page.
   The source artwork is one contact sheet: three untouched 512px columns.
   Every output below is made by the same renderers as the booth itself. */
(function(global){
"use strict";

/* The contact sheet ships pre-cropped to the 640 rows this file actually
   draws, and as 4:4:4 JPEG rather than PNG — 2,232,546 bytes became 248,290.
   The crop arithmetic below is unchanged and still centres itself, so it
   keeps working if the sheet is ever re-cut with spare rows again. JPEG is
   used rather than WebP because every browser this page targets decodes it,
   which is worth more here than the last 100 KB. */
var PHOTO_URL="assets/demo-photos.jpg";
var SOURCE_WIDTH=1536;
var SOURCE_COLUMN=512;
var SOURCE_CROP_HEIGHT=640; /* 4:5, cropped vertically without resampling. */
var COVER_BASE=620;
var COMPARISON_BASE=470;
var BUSINESS_BASE=560;
var POLAROID_BASE=520;
var EVENT=global.MyBishBashEvent||null;
var DEMO_THEME=EVENT&&typeof EVENT.resolveTheme==="function"?
  EVENT.resolveTheme("after-dark"):null;

var SETTINGS={
  eventTitle:"Brays's 15th Birthday",
  date:"2026",
  stripTop:"THE BIRTHDAY ISSUE",
  stripSecond:"Brays's 15th Birthday",
  stripSignature:"Brays's 15th Birthday",
  stripDate:"2026",
  themeId:DEMO_THEME&&DEMO_THEME.id||"after-dark",
  themePrimary:DEMO_THEME&&DEMO_THEME.primary||"#d86c8f",
  themeSecondary:DEMO_THEME&&DEMO_THEME.secondary||"#242126",
  themeHighlight:DEMO_THEME&&DEMO_THEME.highlight||"#eee6ff",
  themeBackground:DEMO_THEME&&DEMO_THEME.background||"#0b0b0b",
  polaroidTransition:"crossfade"
};

var state={
  frameStyle:"white",
  filterStyle:"original",
  template:"keepsake",
  businessName:"YOUR BRAND",
  businessPrimary:"#1c1c1c",
  businessSecondary:"#ff5d73",
  businessLogo:null
};

var demoImages=[];
var sourceImage=null;
var polaroidJob=null;
var polaroidFrame=0;
var polaroidStarted=0;
var listeners=[];
var logoReadToken=0;
var destroyed=false;

var requestFrame=global.requestAnimationFrame||function(fn){
  return global.setTimeout(function(){fn(now());},16);
};
var cancelFrame=global.cancelAnimationFrame||global.clearTimeout;

function now(){
  return global.performance&&typeof global.performance.now==="function"?
    global.performance.now():Date.now();
}

function byId(id){return document.getElementById(id);}

function canvasContext(canvas){
  if(!canvas||typeof canvas.getContext!=="function")return null;
  try{return canvas.getContext("2d");}catch(error){return null;}
}

function mark(canvas,ready){
  if(!canvas||!canvas.setAttribute)return;
  canvas.setAttribute("data-demo-ready",ready?"true":"false");
}

function safeRender(canvas,draw){
  var ctx=canvasContext(canvas);
  if(!ctx)return false;
  try{
    draw(ctx,canvas);
    mark(canvas,true);
    return true;
  }catch(error){
    mark(canvas,false);
    if(global.console&&typeof global.console.warn==="function"){
      global.console.warn("LUMEE BOOTH demo could not render",error);
    }
    return false;
  }
}

function fonts(){
  return global.Fonts&&typeof global.Fonts.faces==="function"?
    global.Fonts.faces(SETTINGS):undefined;
}

function freeBranding(){
  return {
    mode:"free",
    text:"LUMEE BOOTH PHOTOBOOTH"
  };
}

function personalBranding(){
  return {
    mode:"personal",
    text:"POWERED BY LUMEE BOOTH PHOTOBOOTH"
  };
}

function businessBranding(){
  return {
    mode:"business",
    text:state.businessName,
    brandName:state.businessName,
    primaryColor:state.businessPrimary,
    secondaryColor:state.businessSecondary,
    logoImage:state.businessLogo
  };
}

function coverSize(base){
  if(!global.Covers||typeof global.Covers.coverSize!=="function")return null;
  return global.Covers.coverSize("portrait",base);
}

function coverCopy(){
  if(!global.Covers||typeof global.Covers.copyFor!=="function")return null;
  return global.Covers.copyFor(SETTINGS);
}

function polaroidCopy(){
  if(!global.Polaroid||typeof global.Polaroid.copyFor!=="function")return null;
  return global.Polaroid.copyFor(SETTINGS);
}

function renderStripCanvas(canvas){
  var api=global.MyBishBashRenderers;
  if(!canvas||demoImages.length!==3||!api||typeof api.renderStrip!=="function"){
    mark(canvas,false);
    return false;
  }
  return safeRender(canvas,function(ctx,target){
    api.renderStrip(ctx,target,demoImages,SETTINGS,"portrait",{
      frameStyle:state.frameStyle,
      filterStyle:state.filterStyle,
      branding:personalBranding(),
      themeMode:"personal"
    });
  });
}

function renderStrip(){
  var ids=["heroStripCanvas","landingStripCanvas"];
  var rendered=false;
  ids.forEach(function(id){rendered=renderStripCanvas(byId(id))||rendered;});
  return rendered;
}

function renderMagazineCanvas(canvas,base,template,branding,accent){
  var size;
  if(!canvas||demoImages.length!==3||!global.Covers||
     typeof global.Covers.render!=="function"){
    mark(canvas,false);
    return false;
  }
  size=coverSize(base);
  if(!size)return false;
  return safeRender(canvas,function(ctx,target){
    target.width=size.width;
    target.height=size.height;
    global.Covers.render(ctx,{
      img:demoImages[1],
      fonts:fonts(),
      width:size.width,
      height:size.height,
      copy:coverCopy(),
      accent:accent||SETTINGS.themePrimary,
      template:template,
      edition:{no:26},
      branding:branding
    });
  });
}

function renderMagazine(){
  var ids=["heroMagazineCanvas","landingMagazineCanvas"];
  var rendered=false;
  ids.forEach(function(id){
    rendered=renderMagazineCanvas(
      byId(id),COVER_BASE,state.template,personalBranding(),SETTINGS.themePrimary
    )||rendered;
  });
  return rendered;
}

function stopPolaroid(){
  if(polaroidFrame){cancelFrame(polaroidFrame);polaroidFrame=0;}
  polaroidJob=null;
}

function polaroidCanvases(){
  return [byId("heroPolaroidCanvas"),byId("landingPolaroidCanvas")].filter(function(canvas){return !!canvas;});
}

function inViewport(canvas){
  var rect;
  if(!canvas||typeof canvas.getBoundingClientRect!=="function")return true;
  rect=canvas.getBoundingClientRect();
  return rect.bottom>=0&&rect.top<=(global.innerHeight||document.documentElement.clientHeight||0);
}

function drawPolaroidFrame(seconds,drawEveryCanvas){
  var canvases=polaroidCanvases();
  var targets=drawEveryCanvas?canvases:canvases.filter(inViewport);
  var primary=targets[0];
  var ctx;
  if(!primary||!polaroidJob)return false;
  ctx=canvasContext(primary);
  if(!ctx)return false;
  polaroidJob.drawAt(ctx,seconds);
  mark(primary,true);
  targets.slice(1).forEach(function(canvas){
    var target=canvasContext(canvas);
    if(!target)return;
    target.clearRect(0,0,canvas.width,canvas.height);
    target.drawImage(primary,0,0,canvas.width,canvas.height);
    mark(canvas,true);
  });
  return true;
}

function prefersReducedMotion(){
  return !!(global.matchMedia&&global.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function animatePolaroid(){
  var landing=byId("landing");
  if(destroyed||!polaroidJob)return;
  if(landing&&landing.classList&&!landing.classList.contains("active")){
    polaroidFrame=requestFrame(animatePolaroid);
    return;
  }
  try{
    drawPolaroidFrame((now()-polaroidStarted)/1000,false);
  }catch(error){
    polaroidCanvases().forEach(function(canvas){mark(canvas,false);});
    stopPolaroid();
    return;
  }
  polaroidFrame=requestFrame(animatePolaroid);
}

function renderPolaroid(){
  var canvases=polaroidCanvases();
  stopPolaroid();
  if(!canvases.length||demoImages.length!==3||!global.Polaroid||
     typeof global.Polaroid.compose!=="function"){
    canvases.forEach(function(canvas){mark(canvas,false);});
    return false;
  }
  try{
    polaroidJob=global.Polaroid.compose({
      base:POLAROID_BASE,
      images:demoImages,
      copy:polaroidCopy(),
      hand:global.Fonts&&typeof global.Fonts.stack==="function"?
        global.Fonts.stack("hand",SETTINGS):undefined,
      transition:SETTINGS.polaroidTransition,
      backdrop:SETTINGS.themeBackground,
      attribution:personalBranding()
    });
    canvases.forEach(function(canvas){
      canvas.width=polaroidJob.geo.W;
      canvas.height=polaroidJob.geo.H;
    });
    polaroidStarted=now();
    drawPolaroidFrame(0,true);
    if(!prefersReducedMotion())animatePolaroid();
    return true;
  }catch(error){
    polaroidJob=null;
    canvases.forEach(function(canvas){mark(canvas,false);});
    if(global.console&&typeof global.console.warn==="function"){
      global.console.warn("LUMEE BOOTH Polaroid demo could not render",error);
    }
    return false;
  }
}

function renderComparison(){
  var freeCanvas=byId("compareFreeCanvas");
  var personalCanvas=byId("comparePersonalCanvas");
  var a=renderMagazineCanvas(
    freeCanvas,COMPARISON_BASE,"keepsake",freeBranding(),SETTINGS.themePrimary
  );
  var b=renderMagazineCanvas(
    personalCanvas,COMPARISON_BASE,"keepsake",personalBranding(),SETTINGS.themePrimary
  );
  return a||b;
}

function readBusinessFields(){
  var name=byId("businessBrandName");
  var primary=byId("businessPrimary");
  var secondary=byId("businessSecondary");
  if(name&&String(name.value||"").replace(/^\s+|\s+$/g,"")){
    state.businessName=String(name.value).replace(/^\s+|\s+$/g,"").slice(0,48);
  }
  if(primary&&validColour(primary.value))state.businessPrimary=primary.value;
  if(secondary&&validColour(secondary.value))state.businessSecondary=secondary.value;
}

function validColour(value){
  return /^#[0-9a-f]{6}$/i.test(String(value||""))||
    /^#[0-9a-f]{3}$/i.test(String(value||""));
}

function renderBusiness(){
  readBusinessFields();
  return renderMagazineCanvas(
    byId("businessPreviewCanvas"),BUSINESS_BASE,"press",
    businessBranding(),state.businessSecondary
  );
}

function setLogoStatus(message,isError){
  var status=byId("businessLogoStatus");
  if(!status)return;
  status.textContent=message||"";
  status.setAttribute("data-error",isError?"true":"false");
}

function rerender(){
  if(destroyed||demoImages.length!==3)return false;
  renderStrip();
  renderMagazine();
  renderPolaroid();
  renderComparison();
  renderBusiness();
  return true;
}

function setPressed(attribute,value){
  var buttons=document.querySelectorAll("["+attribute+"]");
  var i,active;
  for(i=0;i<buttons.length;i++){
    active=buttons[i].getAttribute(attribute)===value;
    if(buttons[i].classList)buttons[i].classList.toggle("active",active);
    buttons[i].setAttribute("aria-pressed",active?"true":"false");
  }
}

function addListener(node,type,fn){
  if(!node||!node.addEventListener)return;
  node.addEventListener(type,fn,false);
  listeners.push({node:node,type:type,fn:fn});
}

function bindChoice(attribute,allowed,onChange){
  var buttons=document.querySelectorAll("["+attribute+"]");
  var i;
  for(i=0;i<buttons.length;i++){
    (function(button){
      addListener(button,"click",function(){
        var value=button.getAttribute(attribute);
        if(allowed.indexOf(value)===-1)return;
        onChange(value);
        setPressed(attribute,value);
      });
    })(buttons[i]);
  }
}

function bindControls(){
  var name=byId("businessBrandName");
  var primary=byId("businessPrimary");
  var secondary=byId("businessSecondary");
  var logo=byId("businessLogo");

  bindChoice("data-demo-frame",["white","black","editorial","film"],function(value){
    state.frameStyle=value;
    renderStrip();
  });
  bindChoice("data-demo-filter",["original","bw","vintage","warm","glow"],function(value){
    state.filterStyle=value;
    renderStrip();
  });
  bindChoice("data-demo-template",["keepsake","editorial","noir","press"],function(value){
    state.template=value;
    renderMagazine();
  });
  setPressed("data-demo-frame",state.frameStyle);
  setPressed("data-demo-filter",state.filterStyle);
  setPressed("data-demo-template",state.template);

  addListener(name,"input",renderBusiness);
  addListener(primary,"input",renderBusiness);
  addListener(secondary,"input",renderBusiness);
  addListener(logo,"change",readBusinessLogo);
}

function logoBytesAreSafe(file,buffer){
  var bytes,ext,name;
  if(!buffer||typeof global.Uint8Array!=="function")return false;
  bytes=new global.Uint8Array(buffer);
  name=String(file.name||"").toLowerCase();
  ext=name.indexOf(".")===-1?"":name.split(".").pop();
  if(file.type==="image/png"){
    return ext==="png"&&bytes.length>=8&&
      bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&
      bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
  }
  return file.type==="image/jpeg"&&(ext==="jpg"||ext==="jpeg")&&
    bytes.length>=5&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&
    bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
}

function loadLogoImage(file,token){
  var reader=new global.FileReader();
  var image;
  reader.onload=function(){
    if(destroyed||token!==logoReadToken)return;
    image=new Image();
    image.onload=function(){
      if(destroyed||token!==logoReadToken)return;
      state.businessLogo=image;
      setLogoStatus("Logo added to the live preview.",false);
      renderBusiness();
    };
    image.onerror=function(){
      if(token!==logoReadToken)return;
      setLogoStatus("That logo could not be read. The preview is using text instead.",true);
      renderBusiness();
    };
    image.src=reader.result;
  };
  reader.onerror=function(){
    if(token!==logoReadToken)return;
    setLogoStatus("That logo could not be read. The preview is using text instead.",true);
    renderBusiness();
  };
  reader.readAsDataURL(file);
}

function readBusinessLogo(event){
  var input=event&&event.currentTarget?event.currentTarget:byId("businessLogo");
  var file=input&&input.files&&input.files[0];
  var token=++logoReadToken;
  var reader;
  state.businessLogo=null;
  if(!file){setLogoStatus("",false);renderBusiness();return;}

  /* SVG is intentionally not interpreted in this dependency-free preview.
     Production SVG support needs sanitising; PNG and JPEG are safe here. */
  if(!/^(image\/png|image\/jpeg)$/i.test(file.type||"")||file.size>2*1024*1024){
    if(input&&typeof input.setCustomValidity==="function"){
      input.setCustomValidity("Choose a PNG or JPG logo under 2 MB.");
      if(typeof input.reportValidity==="function")input.reportValidity();
    }
    setLogoStatus("Choose a PNG or JPG logo under 2 MB.",true);
    renderBusiness();
    return;
  }
  if(input&&typeof input.setCustomValidity==="function")input.setCustomValidity("");
  if(typeof global.FileReader!=="function"){
    setLogoStatus("Logo preview is unavailable in this browser.",true);
    renderBusiness();
    return;
  }
  reader=new global.FileReader();
  reader.onload=function(){
    if(destroyed||token!==logoReadToken)return;
    if(!logoBytesAreSafe(file,reader.result)){
      setLogoStatus("That file does not contain a valid PNG or JPG logo.",true);
      renderBusiness();
      return;
    }
    loadLogoImage(file,token);
  };
  reader.onerror=function(){
    if(token!==logoReadToken)return;
    setLogoStatus("That logo could not be read. The preview is using text instead.",true);
    renderBusiness();
  };
  reader.readAsArrayBuffer(file);
}

function inputCanvas(container,index,existing){
  var canvas=existing||document.createElement("canvas");
  if(!existing&&container){
    container.appendChild(canvas);
  }
  canvas.width=SOURCE_COLUMN;
  canvas.height=SOURCE_CROP_HEIGHT;
  canvas.setAttribute("data-demo-photo",String(index+1));
  canvas.setAttribute("role","img");
  canvas.setAttribute("aria-label","Demo photograph "+String(index+1)+" of 3");
  return canvas;
}

function makeDemoImages(image){
  var container=byId("demoInputs");
  var existing=container?container.getElementsByTagName("canvas"):[];
  var cropY=Math.floor((image.naturalHeight-SOURCE_CROP_HEIGHT)/2);
  var canvases=[];
  var i,canvas,ctx;
  if(image.naturalWidth!==SOURCE_WIDTH||image.naturalHeight<SOURCE_CROP_HEIGHT){
    if(container)container.setAttribute("data-demo-ready","false");
    return false;
  }
  for(i=0;i<3;i++){
    canvas=inputCanvas(container,i,existing[i]);
    ctx=canvasContext(canvas);
    if(!ctx)return false;
    ctx.clearRect(0,0,SOURCE_COLUMN,SOURCE_CROP_HEIGHT);
    ctx.drawImage(
      image,i*SOURCE_COLUMN,cropY,SOURCE_COLUMN,SOURCE_CROP_HEIGHT,
      0,0,SOURCE_COLUMN,SOURCE_CROP_HEIGHT
    );
    mark(canvas,true);
    canvases.push(canvas);
  }
  demoImages=canvases;
  if(container)container.setAttribute("data-demo-ready","true");
  return true;
}

function loadDemoPhotos(){
  sourceImage=new Image();
  sourceImage.onload=function(){
    if(destroyed)return;
    if(makeDemoImages(sourceImage))rerender();
  };
  sourceImage.onerror=function(){
    var container=byId("demoInputs");
    if(container)container.setAttribute("data-demo-ready","false");
  };
  sourceImage.src=PHOTO_URL;
}

function update(next){
  var field;
  if(destroyed||!next)return false;
  if(["white","black","editorial","film"].indexOf(next.frameStyle)!==-1){
    state.frameStyle=next.frameStyle;
  }
  if(["original","bw","vintage","warm","glow"].indexOf(next.filterStyle)!==-1){
    state.filterStyle=next.filterStyle;
  }
  if(["keepsake","editorial","noir","press"].indexOf(next.template)!==-1){
    state.template=next.template;
  }
  if(typeof next.businessName==="string"&&next.businessName.replace(/^\s+|\s+$/g,"")){
    state.businessName=next.businessName.replace(/^\s+|\s+$/g,"").slice(0,48);
    field=byId("businessBrandName");
    if(field)field.value=state.businessName;
  }
  if(validColour(next.businessPrimary)){
    state.businessPrimary=next.businessPrimary;
    field=byId("businessPrimary");
    if(field)field.value=state.businessPrimary;
  }
  if(validColour(next.businessSecondary)){
    state.businessSecondary=next.businessSecondary;
    field=byId("businessSecondary");
    if(field)field.value=state.businessSecondary;
  }
  if(next.businessLogo!==undefined)state.businessLogo=next.businessLogo;
  setPressed("data-demo-frame",state.frameStyle);
  setPressed("data-demo-filter",state.filterStyle);
  setPressed("data-demo-template",state.template);
  return rerender();
}

function cleanup(){
  var i,item;
  if(destroyed)return;
  destroyed=true;
  stopPolaroid();
  logoReadToken++;
  if(sourceImage){sourceImage.onload=null;sourceImage.onerror=null;}
  for(i=0;i<listeners.length;i++){
    item=listeners[i];
    item.node.removeEventListener(item.type,item.fn,false);
  }
  listeners=[];
}

function init(){
  if(destroyed)return;
  bindControls();
  loadDemoPhotos();
}

global.MyBishBashMarketing={
  rerender:rerender,
  update:update,
  cleanup:cleanup
};

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",init,false);
}else{
  init();
}

})(window);
