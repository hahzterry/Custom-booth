/* fonts.js — one typography system for the whole booth.

   Before this, three files each had their own hard-coded font stacks:
   covers.js had FONT, app.js had typography(), polaroid.js had HAND_FONT.
   Changing a face meant editing all three and hoping. Now there are five
   named roles, every role has a curated shortlist, and the shortlists are
   the single place a face is ever written down.

   Only faces that ship with iOS and macOS are offered. The booth runs from a
   service-worker cache on an iPad with no guarantee of signal, so a web font
   is not a font — it is a request that might not arrive. Anything missing on
   the device is detected and shown as unavailable rather than silently
   falling back to something that looks nothing like the specimen. */
(function(global){
"use strict";

/* Each option: key, the label an organiser reads, the primary family to test
   for, and the stack actually handed to canvas. Every stack ends in a generic
   so a missing face degrades to something of the right shape. */
const OPTIONS={
  display:[
    ["didot",      "Didot",          "Didot",              'Didot,"Bodoni 72","Playfair Display",Georgia,"Times New Roman",serif'],
    ["bodoni",     "Bodoni 72",      "Bodoni 72",          '"Bodoni 72",Didot,Georgia,"Times New Roman",serif'],
    ["baskerville","Baskerville",    "Baskerville",        'Baskerville,Georgia,"Times New Roman",serif'],
    ["hoefler",    "Hoefler Text",   "Hoefler Text",       '"Hoefler Text",Baskerville,Georgia,serif'],
    ["palatino",   "Palatino",       "Palatino",           'Palatino,"Palatino Linotype",Georgia,serif'],
    ["georgia",    "Georgia",        "Georgia",            'Georgia,"Times New Roman",serif']
  ],
  text:[
    ["avenir",     "Avenir Next",    "Avenir Next",        '"Avenir Next",Avenir,"Helvetica Neue",Helvetica,Arial,sans-serif'],
    ["helvetica",  "Helvetica Neue", "Helvetica Neue",     '"Helvetica Neue",Helvetica,Arial,sans-serif'],
    ["futura",     "Futura",         "Futura",             'Futura,"Avenir Next",Arial,sans-serif'],
    ["gill",       "Gill Sans",      "Gill Sans",          '"Gill Sans","Gill Sans MT","Avenir Next",Arial,sans-serif'],
    ["optima",     "Optima",         "Optima",             'Optima,"Gill Sans","Avenir Next",Arial,sans-serif'],
    ["verdana",    "Verdana",        "Verdana",            'Verdana,"Helvetica Neue",Arial,sans-serif']
  ],
  condensed:[
    ["avenircond", "Avenir Cond.",   "Avenir Next Condensed", '"Avenir Next Condensed","Arial Narrow",Impact,"Avenir Next",sans-serif'],
    ["narrow",     "Arial Narrow",   "Arial Narrow",       '"Arial Narrow","Avenir Next Condensed",Impact,sans-serif'],
    ["impact",     "Impact",         "Impact",             'Impact,Haettenschweiler,"Arial Narrow",sans-serif'],
    ["futuracond", "Futura",         "Futura",             'Futura,"Avenir Next Condensed","Arial Narrow",sans-serif']
  ],
  script:[
    ["snell",      "Snell Roundhand","Snell Roundhand",    '"Snell Roundhand","Apple Chancery","Segoe Script","Brush Script MT",cursive'],
    ["chancery",   "Apple Chancery", "Apple Chancery",     '"Apple Chancery","Snell Roundhand","Segoe Script",cursive'],
    ["savoye",     "Savoye LET",     "Savoye LET",         '"Savoye LET","Snell Roundhand","Apple Chancery",cursive'],
    ["zapfino",    "Zapfino",        "Zapfino",            'Zapfino,"Snell Roundhand","Apple Chancery",cursive'],
    ["brush",      "Brush Script",   "Brush Script MT",    '"Brush Script MT","Snell Roundhand",cursive']
  ],
  hand:[
    ["markerfelt", "Marker Felt",    "Marker Felt",        '"Marker Felt","Bradley Hand","Segoe Print","Comic Sans MS",cursive'],
    ["bradley",    "Bradley Hand",   "Bradley Hand",       '"Bradley Hand","Marker Felt","Segoe Print",cursive'],
    ["noteworthy", "Noteworthy",     "Noteworthy",         'Noteworthy,"Marker Felt","Bradley Hand",cursive'],
    ["chalkboard", "Chalkboard SE",  "Chalkboard SE",      '"Chalkboard SE","Marker Felt","Comic Sans MS",cursive'],
    ["snell",      "Snell Roundhand","Snell Roundhand",    '"Snell Roundhand","Apple Chancery","Brush Script MT",cursive'],
    ["chancery",   "Apple Chancery", "Apple Chancery",     '"Apple Chancery","Snell Roundhand",cursive']
  ]
};

/* [role, settings key, the label an organiser reads, what it drives]. */
const ROLES=[
  ["display",  "fontDisplay",  "Headlines",   "Cover mastheads and the strip's title"],
  ["text",     "fontText",     "Small caps",  "Cover detail lines, dates, footers"],
  ["condensed","fontCondensed","Condensed",   "Stacked cover lines and cover lines"],
  ["script",   "fontScript",   "Script",      "The strip signature and cover script"],
  ["hand",     "fontHand",     "Handwriting", "The Living Polaroid's felt tip"]
];

const DEFAULTS={display:"didot",text:"avenir",condensed:"avenircond",script:"snell",hand:"markerfelt"};

function optionsFor(role){return OPTIONS[role]||[];}
function find(role,key){
  const list=optionsFor(role);
  return list.find(o=>o[0]===key)||list.find(o=>o[0]===DEFAULTS[role])||list[0];
}
/* The stack for a role, given the settings object. Unknown or blank falls
   back to the shipped default, same contract as every other booth setting. */
function stack(role,settings){
  const row=ROLES.find(r=>r[0]===role);
  const key=row&&settings?String(settings[row[1]]||"").trim():"";
  const opt=find(role,key);
  return opt?opt[3]:"sans-serif";
}
function labelFor(role,settings){
  const row=ROLES.find(r=>r[0]===role);
  const key=row&&settings?String(settings[row[1]]||"").trim():"";
  const opt=find(role,key);
  return opt?opt[1]:"";
}

/* Is a face actually on this device? Measured, because the booth iPad and the
   laptop the settings were tuned on are not the same machine. A family that
   is missing measures identically to the generic behind it; two different
   generics are tried because a few faces genuinely share metrics with one. */
let probe=null;
const PROBE_TEXT="MWmwil1@#Your Celebration ♡";
function widthIn(family,size){
  if(!probe)probe=document.createElement("canvas").getContext("2d");
  probe.font=`${size}px ${family}`;
  return probe.measureText(PROBE_TEXT).width;
}
const availCache={};
function available(family){
  if(availCache[family]!==undefined)return availCache[family];
  let hit=false;
  try{
    for(const generic of ["monospace","serif"]){
      const base=widthIn(generic,72);
      const test=widthIn(`"${family}",${generic}`,72);
      if(Math.abs(test-base)>0.5){hit=true;break;}
    }
  }catch(e){hit=true;}
  availCache[family]=hit;
  return hit;
}

/* The four names covers.js has always used for its faces, plus the Polaroid's
   hand — resolved in one call so a renderer never reaches for a font itself. */
function faces(settings){
  return {
    serif:stack("display",settings),
    sans:stack("text",settings),
    condensed:stack("condensed",settings),
    script:stack("script",settings),
    hand:stack("hand",settings)
  };
}

/* The old Polaroid shipped a two-way marker/cursive toggle. Anyone who chose
   cursive keeps a cursive hand; everyone else lands on the same felt tip they
   already had. Runs before the settings object is ever read for a font. */
function migrate(raw){
  const out=Object.assign({},raw);
  if(typeof out.fontHand!=="string"&&typeof raw.polaroidHand==="string")
    out.fontHand=raw.polaroidHand==="cursive"?"snell":"markerfelt";
  delete out.polaroidHand;
  return out;
}

global.Fonts={ROLES,OPTIONS,DEFAULTS,optionsFor,find,stack,labelFor,available,faces,migrate};

})(window);
