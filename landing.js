/* landing.js — the public site's experiential entrance and live event demo.
   It owns no booth state. The demo emits a configuration event; app.js decides
   whether that configuration is a temporary preview or a saved event. */
(function(global){
"use strict";

var ENTRANCE_KEY="mybishbashPhotoboothEntranceSeenV1";
var EVENT=global.MyBishBashEvent||null;
var DEFAULT_THEME_ID="pop";
var currentThemeId=DEFAULT_THEME_ID;

function byId(id){return document.getElementById(id);}
function text(value,max){return String(value||"").trim().slice(0,max||100);}
function title(value){return text(value,64)||"Your Event";}
function metaLine(location,date){return [text(location,48),text(date,32)].filter(Boolean).join(" · ");}

function themeFor(value){
  if(EVENT&&typeof EVENT.resolveTheme==="function")return EVENT.resolveTheme(value);
  var registry=EVENT&&EVENT.THEMES||{};
  return registry[value]||registry[DEFAULT_THEME_ID]||null;
}

function themeInk(background){
  return EVENT&&typeof EVENT.safeForeground==="function"?EVENT.safeForeground(background):"";
}

function demoConfig(){
  var theme=themeFor(currentThemeId);
  return {
    eventType:text(byId("landingEventType")&&byId("landingEventType").value,24)||"party",
    eventTitle:title(byId("landingEventName")&&byId("landingEventName").value),
    location:text(byId("landingEventLocation")&&byId("landingEventLocation").value,48),
    date:text(byId("landingEventDate")&&byId("landingEventDate").value,32),
    datePrecision:"exact",
    eventLine:text(byId("landingEventLine")&&byId("landingEventLine").value,72),
    themeId:theme&&theme.id||DEFAULT_THEME_ID,
    themeName:theme&&theme.name||"",
    themeTagline:theme&&theme.tagline||"",
    themePrimary:theme&&theme.primary||"",
    themeSecondary:theme&&theme.secondary||"",
    themeHighlight:theme&&theme.highlight||"",
    themeBackground:theme&&theme.background||"",
    themeForeground:theme&&theme.foreground||"",
    themeButton:theme&&theme.button||"",
    themeButtonInk:theme&&theme.buttonInk||"",
    themeBorder:theme&&theme.border||"",
    themeDecoration:theme&&theme.decoration||"",
    themeTypography:theme&&theme.typography||"",
    themeStripFrame:theme&&theme.stripFrame||"",
    themeStripFilter:theme&&theme.stripFilter||"",
    themeMagazineTemplate:theme&&theme.magazineTemplate||"",
    /* These are the host-editable output choices. Seeding them from the
       selected theme makes the landing preview match the same defaults the
       full host picker applies, while EventConfig still preserves later
       manual overrides independently. */
    stripFrame:theme&&theme.stripFrame||"white",
    stripFilter:theme&&theme.stripFilter||"original",
    magazineTemplate:theme&&theme.magazineTemplate||"keepsake"
  };
}

function applyTheme(node,value){
  var theme=themeFor(value);
  if(!node||!theme)return;
  node.setAttribute("data-theme",theme.id);
  node.setAttribute("data-decoration",theme.decoration);
  node.setAttribute("data-typography",theme.typography);
  node.style.setProperty("--event-primary",theme.primary);
  node.style.setProperty("--event-secondary",theme.secondary);
  node.style.setProperty("--event-highlight",theme.highlight);
  node.style.setProperty("--event-shape",theme.highlight);
  node.style.setProperty("--event-surface",theme.background);
  node.style.setProperty("--event-ink",theme.foreground||themeInk(theme.background));
  node.style.setProperty("--event-accent",theme.primary);
  node.style.setProperty("--event-accent-ink",themeInk(theme.primary));
  node.style.setProperty("--event-button",theme.button);
  node.style.setProperty("--event-button-ink",theme.buttonInk||themeInk(theme.button));
  node.style.setProperty("--event-border",theme.border);
}

function hydrateThemeCards(){
  document.querySelectorAll(".theme-card[data-theme]").forEach(function(card){
    var theme=themeFor(card.getAttribute("data-theme"));
    if(!theme)return;
    card.setAttribute("data-decoration",theme.decoration);
    card.setAttribute("data-typography",theme.typography);
    card.style.setProperty("--theme-primary",theme.primary);
    card.style.setProperty("--theme-secondary",theme.secondary);
    card.style.setProperty("--theme-highlight",theme.highlight);
    card.style.setProperty("--theme-background",theme.background);
    card.style.setProperty("--theme-foreground",theme.foreground||themeInk(theme.background));
    card.style.setProperty("--theme-button",theme.button);
    card.style.setProperty("--theme-button-ink",theme.buttonInk||themeInk(theme.button));
    card.style.setProperty("--theme-border",theme.border);
  });
}

function renderDemo(){
  var config=demoConfig();
  var preview=byId("landingEventPreview");
  var previewLine=byId("landingPreviewLine");
  var compareLine=byId("personalCompareMeta");
  var compareTitle=byId("personalCompareTitle");
  var compareLabel=byId("personalCompareLabel");
  var line=metaLine(config.location,config.date);
  if(byId("landingPreviewTitle"))byId("landingPreviewTitle").textContent=config.eventTitle;
  if(byId("landingPreviewMeta"))byId("landingPreviewMeta").textContent=line;
  if(previewLine){previewLine.textContent=config.eventLine;previewLine.hidden=!config.eventLine;}
  if(compareTitle)compareTitle.textContent=config.eventTitle;
  if(compareLabel)compareLabel.textContent=config.eventTitle;
  if(compareLine)compareLine.textContent=line;
  applyTheme(preview,currentThemeId);
  var example=document.querySelector(".personal-welcome-browser .booth-example");
  applyTheme(example,currentThemeId);
}

function chooseTheme(input){
  var theme=input&&input.checked&&themeFor(input.value);
  if(!theme)return;
  currentThemeId=theme.id;
  renderDemo();
}

function dispatchPreview(){
  global.dispatchEvent(new CustomEvent("mybishbash:preview-event",{detail:demoConfig()}));
}

function entranceAllowed(){
  if(/(?:^|\/)business\/?$/.test(global.location.pathname))return false;
  if(global.location.hash)return false;
  try{return global.sessionStorage.getItem(ENTRANCE_KEY)!=="1";}catch(error){return true;}
}

function rememberEntrance(){try{global.sessionStorage.setItem(ENTRANCE_KEY,"1");}catch(error){}}

function revealSite(){
  var entrance=byId("siteEntrance"),landing=byId("landing");
  if(!entrance||entrance.classList.contains("revealing"))return;
  rememberEntrance();
  entrance.classList.add("revealing");
  document.body.classList.remove("entrance-open");
  if(landing){landing.removeAttribute("aria-hidden");try{landing.inert=false;}catch(error){}}
  var reduce=global.matchMedia&&global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  global.setTimeout(function(){
    entrance.hidden=true;
    entrance.classList.remove("active","revealing");
    var target=document.querySelector(".hero-start");
    if(target&&typeof target.focus==="function")target.focus({preventScroll:true});
  },reduce?160:720);
}

function initEntrance(){
  var entrance=byId("siteEntrance"),button=byId("siteEntranceStart"),landing=byId("landing");
  if(!entrance||!button||!entranceAllowed())return;
  entrance.hidden=false;
  document.body.classList.add("entrance-open");
  if(landing){landing.setAttribute("aria-hidden","true");try{landing.inert=true;}catch(error){}}
  global.requestAnimationFrame(function(){
    entrance.classList.add("active");
    button.focus({preventScroll:true});
  });
  button.addEventListener("click",revealSite,false);
}

function initDemo(){
  var form=byId("landingEventForm");
  hydrateThemeCards();
  if(form)form.addEventListener("input",function(event){
    if(event.target&&event.target.hasAttribute("data-landing-theme"))chooseTheme(event.target);
    else renderDemo();
  },false);
  var preview=byId("previewCreatedBooth");
  if(preview)preview.addEventListener("click",dispatchPreview,false);
  var selected=document.querySelector('[name="landingTheme"]:checked');
  if(selected)chooseTheme(selected);else renderDemo();
}

function init(){initDemo();initEntrance();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,false);
else init();

global.MyBishBashLanding={demoConfig:demoConfig,renderDemo:renderDemo,revealSite:revealSite};
})(window);
