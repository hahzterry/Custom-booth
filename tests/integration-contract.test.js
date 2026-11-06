"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var EventConfig = require("../event.js");

var ROOT = path.resolve(__dirname, "..");
function source(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

var app = source("app.js");
var covers = source("covers.js");
var polaroid = source("polaroid.js");
var strip = source("strip.js");
var marketing = source("marketing.js");
var html = source("index.html");
var styles = source("styles.css");
var manifest = source("manifest.webmanifest");
var serviceWorker = source("sw.js");
var vercelIgnore = source(".vercelignore");
var vercel = JSON.parse(source("vercel.json"));

function relativeLuminance(hex) {
  var channels = String(hex).slice(1).match(/.{2}/g).map(function (part) {
    return parseInt(part, 16) / 255;
  });
  return channels.reduce(function (total, channel, index) {
    var linear = channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    return total + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

test("sends public Start directly into one shared three-photo capture", function () {
  var launch = app.slice(app.indexOf("function launchFreeBooth"), app.indexOf("function previewExampleBooth"));
  var session = app.slice(app.indexOf("async function beginSession"), app.indexOf("function beginSharedSession"));
  assert.match(launch, /enterBoothHistory\(\);beginSharedSession\(false\)/);
  assert.match(app, /document\.querySelectorAll\("\[data-start-photobooth\]"\)/);
  assert.doesNotMatch(launch, /(checkout|register|email)/i);
  assert.doesNotMatch(html, /id="experience"/);
  assert.doesNotMatch(html, /data-experience=/);
  assert.match(session, /const shared=experience==="shared"/);
  assert.match(session, /sharedOutputSession=shared/);
  assert.match(session, /const total=shared\|\|currentExperience==="strip"\?3:1/);
  assert.match(session, /photos\.push\(capturePhoto\(\)\)/);
  assert.match(app, /\$\("reviewModeNav"\)\.hidden=!sharedOutputSession/);
});

test("exposes Personal and Business as separate static product surfaces", function () {
  ["landing", "business", "welcome", "camera", "review", "settings"].forEach(function (id) {
    assert.match(html, new RegExp('id="' + id + '"'));
  });
  assert.match(html, /data-product-route="personal"/);
  assert.match(html, /data-product-route="business"/);
  assert.match(app, /function routeFromLocation\(\)/);
  assert.match(app, /window\.addEventListener\("popstate"/);
  assert.equal(vercel.cleanUrls, undefined, "cleanUrls rewrites index.html away before the static root fallback can resolve it");
  assert.deepEqual(vercel.rewrites, [
    { source: "/", destination: "/index.html" },
    { source: "/business", destination: "/index.html" },
    { source: "/business/", destination: "/index.html" }
  ]);
});

test("renders attribution inside every output pipeline", function () {
  assert.match(app, /return STRIP\.render\(ctx,\{[\s\S]*?branding,/);
  assert.match(strip, /const brand=brandingLayout\(opts\.branding,geo\)/);
  assert.match(app, /branding:currentBranding\(\)/);
  assert.match(app, /attribution:currentBranding\(\)/);

  var templateRender = covers.indexOf("(RENDERERS[opts.template]||tplKeepsake)(L);");
  var coverBrand = covers.indexOf("drawOutputBranding(ctx,L,opts.branding");
  assert.ok(templateRender >= 0 && coverBrand > templateRender, "cover branding follows the real template render");

  var handwriting = polaroid.indexOf("drawHand(ctx,geo,copy,hand);");
  var polaroidBrand = polaroid.indexOf("drawAttribution(ctx,geo,attribution);");
  var windowClear = polaroid.indexOf("ctx.clearRect(p.x,p.y,p.w,p.h);");
  assert.ok(handwriting >= 0 && polaroidBrand > handwriting, "Polaroid attribution is part of the print chrome");
  assert.ok(windowClear > polaroidBrand, "photo window remains clear after attribution is drawn");
  assert.match(polaroid, /buildChrome\(geo,o\.copy\|\|\{\},o\.hand\|\|HAND_FALLBACK,o\.backdrop,o\.attribution\)/);
});

test("uses the real renderers for homepage evidence and keeps Polaroid moving", function () {
  assert.match(marketing, /global\.MyBishBashRenderers/);
  assert.match(marketing, /global\.Covers\.render/);
  assert.match(marketing, /global\.Polaroid\.compose/);
  assert.match(marketing, /polaroidJob\.drawAt/);
  assert.match(marketing, /requestFrame\(animatePolaroid\)/);
  ["heroStripCanvas", "heroMagazineCanvas", "heroPolaroidCanvas"].forEach(function (id) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.ok(marketing.includes('"' + id + '"'), id + " must be wired into marketing.js");
  });
  assert.match(marketing, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(marketing, /if\(!prefersReducedMotion\(\)\)animatePolaroid\(\)/);
  assert.doesNotMatch(html, /<img[^>]+(?:strip|magazine|polaroid)[^>]+(?:output|result)/i);
});

test("keeps the public landing white, pastel and product-first", function () {
  var hero = html.slice(html.indexOf('class="hero-section'), html.indexOf('class="transformation-section'));
  var landing = html.slice(html.indexOf('<section id="landing"'), html.indexOf('<section id="business"'));
  assert.match(hero, /data-start-photobooth/);
  assert.doesNotMatch(hero, /openPersonalSetup|Customise my booth/i);
  assert.doesNotMatch(html, /promise-strip/);
  assert.doesNotMatch(landing, /These examples use the booth.s real Strip, Magazine and Living Polaroid renderers/i);
  assert.match(styles, /--public-white:#ffffff/);
  assert.match(styles, /\.landing-screen\{background:var\(--public-white\)\}/);
  assert.match(styles, /\.strip-demo-card\{background:var\(--party-pink\)\}/);
  assert.match(styles, /\.magazine-demo-card\{background:var\(--party-blue\)\}/);
  assert.match(styles, /\.polaroid-demo-card\{background:var\(--party-yellow\)\}/);
  assert.equal(JSON.parse(manifest).background_color, "#ffffff");
  assert.equal(JSON.parse(manifest).theme_color, "#ffffff");
});

// ✅ UPDATED TEST: now checks for 6 active product cards
test("places six honest ways to start directly after the output demos", function () {
  var pathsStart = html.indexOf('<section id="personalPaths"');
  var pathsEnd = html.indexOf("</section>", pathsStart) + "</section>".length;
  var paths = html.slice(pathsStart, pathsEnd);
  var expected = [
    { heading: "Use for Free", price: /FREE/i, action: "ENTER" },
    { heading: "Customise Your Own", price: /ONE PARTY/i, action: "ONE EVENT" },
    { heading: "Go Annual", price: /ANNUAL/i, action: "BUY ANNUAL" },
    { heading: "For Business", price: /BUSINESS/i, action: "TALK TO US" },
    { heading: "Founding Lifetime", price: /FOUNDING LIFETIME/i, action: "BUY LIFETIME" },
    { heading: "6 Month Plan", price: /6 MONTH PLAN/i, action: "BUY 6 MONTH PLAN" }
  ];
  var cursor = 0;

  assert.ok(pathsStart >= 0, "the post-demo entry section must exist");
  assert.match(html.slice(Math.max(0, pathsStart - 180), pathsStart), /<\/article>\s*<\/div>\s*$/,
    "the six entry paths must immediately follow the output demo grid");
  assert.equal((paths.match(/class="personal-entry-card [^"]+-path"/g) || []).length, 6);
  expected.forEach(function (entry) {
    var heading = paths.indexOf("<h3>" + entry.heading + "</h3>", cursor);
    assert.ok(heading >= cursor, entry.heading + " must appear in the promised order");
    var cardStart = paths.lastIndexOf("<article", heading);
    var cardEnd = paths.indexOf("</article>", heading);
    var card = paths.slice(cardStart, cardEnd);
    assert.match(card, entry.price);
    assert.match(card, new RegExp(">" + entry.action + "<"));
    cursor = cardEnd;
  });

  assert.match(paths, /<button data-start-photobooth type="button">ENTER<\/button>/);
  assert.match(app, /document\.querySelectorAll\("\[data-start-photobooth\]"\)\.forEach\(button=>button\.onclick=launchFreeBooth\)/);
  assert.match(paths, /<button id="openPersonalSetupSecondary" type="button">ONE EVENT<\/button>/);
  assert.match(app, /\$\("openPersonalSetupSecondary"\)\.onclick=\(\)=>openPersonalSettings\("landing"\)/);
  assert.match(paths, /<button data-checkout-plan="PERSONAL_12_MONTH" type="button">BUY ANNUAL<\/button>/);
  assert.match(paths, /<a data-business-contact href="#businessContact">TALK TO US<\/a>/);
  assert.match(paths, /<button data-checkout-plan="FOUNDING_LIFETIME" type="button">BUY LIFETIME<\/button>/);
  assert.match(paths, /<button data-checkout-plan="PERSONAL_6_MONTH" type="button">BUY 6 MONTH PLAN<\/button>/);
  assert.doesNotMatch(paths, /href="#giftAccess"/);
  assert.doesNotMatch(paths, /href="#"(?:\s|>)/);
});

test("keeps the locked Personal pricing visible while checkout stays honest", function () {
  ["£0", "$44", "$377"].forEach(function (price) {
    assert.ok(html.includes(price), price + " must be visible");
  });
  assert.doesNotMatch(html, /Founding Lifetime|£100|£30|£50/);
  assert.match(html, /One Party and Annual are coming soon/);
  assert.match(app, /const BILLING_LIVE=true/);
  assert.match(app, /if\(!BILLING_LIVE\|\|!API_BASE\)/);
});

test("separates public Home, Event Home, Next Guest and Retake semantics", function () {
  var cancel = app.slice(app.indexOf("function cancelCapture"), app.indexOf("function syncReviewModeUI"));
  var enterGuest = app.slice(app.indexOf("function enterGuestBooth"), app.indexOf("async function submitGuestPin"));
  var restart = app.slice(app.indexOf("function beginSharedSession"), app.indexOf("function inAppBrowser"));
  assert.match(html, /id="boothHomeBtn"[^>]*>Home</);
  assert.match(app, /const HISTORY_SURFACE=\{PRODUCT:"product",EVENT_HOME:"event-home",BOOTH:"booth"\}/);
  assert.match(app, /function setBoothReturnScreen\(target\)[\s\S]*?"Event Home":"Home"/);
  assert.match(app, /function teardownBoothSession\(\)[\s\S]*?captureSessionId\+\+[\s\S]*?clearTimeout\(idleTimer\)[\s\S]*?stillRenderToken\+\+[\s\S]*?stopCamera\(\)[\s\S]*?invalidatePolaroid\(\)/);
  assert.match(app, /function teardownBoothSession\(\)[\s\S]*?hideCameraError\(\)[\s\S]*?stopCamera\(\)/);
  assert.match(cancel, /function cancelCapture\(\)\{\s*showBoothReturnScreen\(\);\s*\}/);
  assert.match(app, /function launchFreeBooth\(\)[\s\S]*?setBoothReturnScreen\("landing"\);enterBoothHistory\(\);beginSharedSession\(false\)/);
  assert.match(enterGuest, /setBoothReturnScreen\("welcome"\);\s*enterBoothHistory\(\);\s*beginSharedSession\(false\)/);
  assert.match(app, /\$\("startBtn"\)\.onclick=enterGuestBooth/);
  assert.match(restart, /function beginSharedSession\(retake,options\)\{return beginSession\("shared",\{retake:!!retake,purpose:options&&options\.purpose\}\);\}/);
  assert.match(restart, /function restartCurrentSession\(\)\{[\s\S]*?const options=\{retake:true,purpose:activeCapturePurpose\};[\s\S]*?sharedOutputSession\?beginSharedSession\(true,options\):beginSession\(currentExperience,options\)/);
  assert.match(app, /\$\("nextGuestBtn"\)\.onclick=\(\)=>beginSharedSession\(false\)/);
  assert.match(app, /\$\("retakeBtn"\)\.onclick=restartCurrentSession/);
  assert.match(app, /window\.addEventListener\("popstate",handleHistoryChange\)/);
  assert.match(app, /bootstrapNavigation\(\)/);
  assert.doesNotMatch(app, /showExperienceChooser/);
});

test("keeps an ended event in guest-safe navigation", function () {
  var welcomeMode = app.slice(app.indexOf("function updateWelcomeMode"), app.indexOf("function refreshHostEventStatus"));
  var enterGuest = app.slice(app.indexOf("function enterGuestBooth"), app.indexOf("async function submitGuestPin"));
  var begin = app.slice(app.indexOf("async function beginSession"), app.indexOf("function launchConfetti"));
  assert.match(html, /id="welcomeEndedMessage"/);
  assert.match(welcomeMode, /guestEnded=!hostView&&String\(settings\.eventStatus\|\|"DRAFT"\)==="ENDED"/);
  assert.match(welcomeMode, /\$\("startBtn"\)\.hidden=pinRequired\|\|guestEnded/);
  assert.match(enterGuest, /settings=EVENT\.refreshEventLifecycle\(settings\)[\s\S]*?settings\.eventStatus==="ENDED"[\s\S]*?updateWelcomeMode\(false\);return/);
  assert.match(begin, /settings\.eventStatus==="ENDED"[\s\S]*?showEventHome\(boothExampleMode,false\);return/);
});

test("cancels stale capture work without stopping a newer camera stream", function () {
  var camera = app.slice(app.indexOf("function releaseMediaStream"), app.indexOf("function initAudio"));
  var session = app.slice(app.indexOf("async function beginSession"), app.indexOf("function launchConfetti"));
  assert.match(camera, /const acquired=await navigator\.mediaDevices\.getUserMedia/);
  assert.doesNotMatch(camera, /stream=await navigator\.mediaDevices\.getUserMedia/);
  assert.equal((camera.match(/releaseMediaStream\(acquired\);throw new Error\("cancelled"\)/g) || []).length, 2);
  assert.match(camera, /if\(video&&video\.srcObject===target\)video\.srcObject=null/);
  assert.match(camera, /if\(stream===target\)stream=null/);
  assert.match(session, /await startCamera\(sid\)/);
  assert.match(session, /activeCapturePurpose=purpose;[\s\S]*?hideCameraError\(\)/);
  assert.match(session, /await delay\(420\);[\s\S]*?if\(sid!==captureSessionId\)return;\s*stopCamera\(\)/);
  assert.match(session, /if\(!isHostTest\)\{[\s\S]*?const galleryRecord=await saveSessionToGallery\(photos,sessionOrientation,shared\?"shared":currentExperience,replaceId\);\s*if\(sid!==captureSessionId\)return/);
  assert.match(session, /if\(galleryRecord\)activeGalleryRecordId=galleryRecord\.id/);
  assert.match(session, /const galleryCount=await countGallerySessions\(\);\s*if\(sid!==captureSessionId\)return/);
  assert.match(session, /if\(currentExperience==="polaroid"\)await enterPolaroid\(\);else await renderWithFade\(\);\s*if\(sid!==captureSessionId\)return/);
  var sessionCatch = session.slice(session.indexOf("}catch(err){"));
  assert.ok(sessionCatch.indexOf("sid!==captureSessionId") < sessionCatch.indexOf("stopCamera()"));
});

test("persists one shared source record per guest and reopens all three outputs", function () {
  var record = app.slice(app.indexOf("function galleryRecord"), app.indexOf("function putSession"));
  var save = app.slice(app.indexOf("async function saveSessionToGallery"), app.indexOf("async function storageBudget"));
  var gallery = app.slice(app.indexOf("async function renderEventGallery"), app.indexOf("function persistSettings"));
  var session = app.slice(app.indexOf("async function beginSession"), app.indexOf("function beginSharedSession"));

  assert.match(record, /const hasRecordId=recordId!==null&&recordId!==undefined&&Number\.isFinite\(Number\(recordId\)\)/);
  assert.match(record, /const id=hasRecordId\?Number\(recordId\):Date\.now\(\)/);
  assert.match(record, /experience:experience\|\|"shared"/);
  assert.match(save, /const record=galleryRecord\(sessionPhotos,orientation,experience,recordId\)/);
  assert.match(save, /await putSession\(record\)/);
  assert.match(save, /return record/);

  assert.match(session, /const retaking=!!\(options&&options\.retake\)/);
  assert.match(session, /const replaceId=shared&&retaking&&!isHostTest\?activeGalleryRecordId:null/);
  assert.match(session, /const replacingRecord=replaceId!==null&&replaceId!==undefined&&Number\.isFinite\(Number\(replaceId\)\)/);
  assert.match(session, /if\(!replacingRecord\)activeGalleryRecordId=null/);
  assert.match(session, /if\(!isHostTest\)\{[\s\S]*?if\(!replacingRecord\)\{[\s\S]*?sessionEdition=nextEditionNumber\(galleryCount\)/);

  assert.match(gallery, /const hasThreeSources=session\.photos\.length===3/);
  assert.match(gallery, /sharedOutputSession=hasThreeSources&&\["shared","legacy","strip"\]\.includes\(recordedExperience\)/);
  assert.match(gallery, /currentExperience=sharedOutputSession\?"strip"/);
  assert.match(gallery, /activeGalleryRecordId=null/);
  assert.match(gallery, /resetCreativeState\(currentExperience\)[\s\S]*?buildReviewControls\(\)[\s\S]*?showScreen\("review"\)/);
});

test("clears Business completion for a fresh guest while preserving it for Retake", function () {
  var session = app.slice(app.indexOf("async function beginSession"), app.indexOf("function beginSharedSession"));
  var reset = app.slice(app.indexOf("function resetGuestCompletionState"), app.indexOf("function enterGuestBooth"));
  var teardown = app.slice(app.indexOf("function teardownBoothSession"), app.indexOf("function setBoothReturnScreen"));

  assert.match(session, /const retaking=!!\(options&&options\.retake\)/);
  assert.match(session, /if\(!retaking\)resetGuestCompletionState\(true\)/);
  assert.doesNotMatch(session, /if\(retaking\)resetGuestCompletionState/);
  assert.match(reset, /businessCompletionSatisfied=false/);
  assert.match(reset, /if\(!clearFields\)return/);
  assert.match(reset, /email\.value=""/);
  assert.match(reset, /marketing\.checked=false/);
  assert.match(reset, /publicity\.checked=false/);
  assert.match(teardown, /resetGuestCompletionState\(true\)/);
});

test("matches the Strip framing guide to the contained camera pixels", function () {
  var guide = app.slice(app.indexOf("function syncStripFramingGuide"), app.indexOf("async function startCamera"));
  assert.match(guide, /video\.videoWidth\/video\.videoHeight/);
  assert.match(guide, /shownWidth=boxRatio>sourceRatio\?availableHeight\*sourceRatio:availableWidth/);
  assert.match(guide, /const stripGeometry=STRIP&&typeof STRIP\.geometry==="function"\?STRIP\.geometry\(\):null/);
  assert.match(guide, /const apertureRatio=aperture\?aperture\.w\/aperture\.h:564\/504/);
  assert.match(guide, /guide\.style\.width=cropWidth\+"px"/);
  assert.match(guide, /guide\.style\.left=shownLeft\+\(shownWidth-cropWidth\)\/2\+"px"/);
  assert.match(app, /sessionOrientation=w>=h\?"landscape":"portrait";\s*syncStripFramingGuide\(\)/);
});

test("marks host draft previews through the canonical output surfaces", function () {
  var admin = app.slice(app.indexOf("function renderAdminPreview"), app.indexOf("function scheduleAdminPreview"));
  var polaroid = admin.slice(admin.indexOf('if(adminPreviewType==="polaroid")'), admin.indexOf("const size=Covers.coverSize"));
  var watermark = app.slice(app.indexOf("function drawDraftPreview"), app.indexOf("/* ---------- living polaroid"));
  assert.match(admin, /adminDraft=String\(s\.eventStatus\|\|"DRAFT"\)==="DRAFT"/);
  assert.match(admin, /draft:adminDraft/);
  assert.match(polaroid, /draftPreview:adminDraft/);
  assert.match(polaroid, /if\(prefersReducedMotion\(\)&&!adminPreviewMotionRequested\)\{[\s\S]*?job\.drawStill\(ctx,0\)/);
  assert.match(polaroid, /function drawPreview\(\)[\s\S]*?job\.drawAt/);
  assert.doesNotMatch(polaroid, /drawDraftPreview/, "Polaroid owns one canonical frame watermark");
  assert.match(admin, /Covers\.render\(ctx,\{[\s\S]*?\}\);\s*drawDraftPreview\(ctx,c\.width,c\.height,adminDraft\)/);
  assert.match(watermark, /rotate\(-Math\.PI\/6\)/);
  assert.match(watermark, /globalAlpha=\.18/);
  assert.match(watermark, /fillText\("SAMPLE",0,0\)/);
  assert.doesNotMatch(watermark, /fillRect|strokeRect|DRAFT PREVIEW/, "Magazine watermark remains text-only");
});

test("keeps a live production-styled Event Home beside the three real outputs", function () {
  var eventPreview = app.slice(app.indexOf("function renderAdminEventHomePreview"), app.indexOf("async function renderAdminPreview"));
  var admin = app.slice(app.indexOf("async function renderAdminPreview"), app.indexOf("function scheduleAdminPreview"));
  var inputs = app.slice(app.indexOf('document.querySelectorAll("#settings input,#settings select")'), app.indexOf("window.addEventListener(\"resize\""));
  var settings = html.slice(html.indexOf('<section id="settings"'), html.indexOf("</main>"));

  assert.match(settings, /data-preview="event-home"/);
  assert.match(settings, /id="adminEventHomePreview"[^>]*class="[^"]*admin-event-home-preview[^"]*welcome-screen[^"]*"[^>]*role="tabpanel"[^>]*aria-labelledby="adminPreviewTabEventHome"/);
  assert.match(settings, /id="adminPreviewTabEventHome"[^>]*role="tab"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.equal((settings.match(/class="admin-preview-tab"[^>]*tabindex="-1"/g) || []).length, 3);
  assert.match(html, /id="welcome"[^>]*class="[^"]*welcome-screen[^"]*"/);
  ["adminEventPreviewEyebrow", "adminEventPreviewTitle", "adminEventPreviewMeta", "adminEventPreviewLine",
    "adminEventPreviewStart", "adminEventPreviewHint"].forEach(function (id) {
    assert.match(settings, new RegExp('id="' + id + '"'));
  });
  assert.match(eventPreview, /applyEventTheme\(preview,s\)/);
  assert.match(eventPreview, /adminEventPreviewTitle"\)\.textContent=String\(s\.eventTitle/);
  assert.match(eventPreview, /adminEventPreviewEyebrow[^\n]*welcomeEyebrow[^\n]*PHOTO BOOTH/);
  assert.match(eventPreview, /adminEventPreviewMeta"\)\.textContent=meta/);
  assert.match(eventPreview, /adminEventPreviewLine"\)\.textContent=line/);
  assert.match(eventPreview, /adminEventPreviewStart"\)\.textContent=String\(s\.startLabel/);
  assert.match(eventPreview, /preview\.setAttribute\("aria-label","Event Home live preview for "/);
  assert.match(admin, /const s=draftSettings\(\),theme=themeFor\(s\)/);
  assert.match(admin, /eventHomePreview=adminPreviewType==="event-home"/);
  assert.match(admin, /c\.hidden=eventHomePreview/);
  assert.match(admin, /eventPreview\.hidden=!eventHomePreview/);
  assert.match(admin, /if\(eventHomePreview\)\{\s*renderAdminEventHomePreview\(s\);\s*return/);
  assert.match(inputs, /scheduleAdminPreview\(\)/,
    "event title, location, date and wording must repaint Event Home without saving");
  assert.match(app, /document\.querySelectorAll\('input\[name="eventTheme"\]'\)[\s\S]*?renderAdminPreview\(\)/,
    "theme selection must repaint the active Event Home immediately");
  ["pop", "after-dark", "editorial", "sunshine"].forEach(function (id) {
    assert.match(styles, new RegExp(':is\\(\\.event-entrance-card,\\.personal-compare \\.booth-example,\\.welcome-screen\\)\\[data-theme="' + id + '"\\]'),
      id + " must use the shared Event Home treatment selector");
  });
  assert.match(app, /applyEventTheme\(\$\("welcome"\),settings\)/,
    "the real Event Home and admin Event Home preview must use the same role applicator");
});

test("keeps uploaded design photos separate and feeds all real output renderers", function () {
  var defaults = app.slice(0, app.indexOf("const FRAMES"));
  var globals = app.slice(app.indexOf("let settings;"), app.indexOf("const $="));
  var usePhotos = app.slice(app.indexOf("async function useAdminPreviewPhotos"), app.indexOf("function clearAdminPreviewPhotos"));
  var readPhoto = app.slice(app.indexOf("async function readPreviewPhoto"), app.indexOf("function renderPreviewPhotoThumbs"));
  var previewImages = app.slice(app.indexOf("async function adminPreviewImages"), app.indexOf("async function renderAdminPreview"));
  var admin = app.slice(app.indexOf("async function renderAdminPreview"), app.indexOf("function scheduleAdminPreview"));
  var record = app.slice(app.indexOf("function galleryRecord"), app.indexOf("function putSession"));
  var persist = app.slice(app.indexOf("function persistSettings"), app.indexOf("function nextEditionNumber"));
  var draft = app.slice(app.indexOf("function draftSettings"), app.indexOf("function releaseMediaStream"));

  assert.match(globals, /let photos=\[\]/);
  assert.match(globals, /let adminPreviewPhotos=\[\]/);
  assert.doesNotMatch(defaults, /adminPreviewPhotos|adminPreviewPhotoIndex/);
  assert.doesNotMatch(record, /adminPreviewPhotos/);
  assert.doesNotMatch(persist, /adminPreviewPhotos/);
  assert.doesNotMatch(draft, /adminPreviewPhotos|adminPreviewPhotoIndex/);
  assert.match(html, /id="adminPreviewPhotos"[^>]*type="file"[^>]*accept="image\/\*"[^>]*multiple/);
  assert.match(usePhotos, /Array\.from\(input&&input\.files\|\|\[\]\)\.slice\(0,3\)/);
  assert.match(readPhoto, /URL\.createObjectURL\(file\)/);
  assert.match(readPhoto, /maxEdge=2048,maxPixels=3000000/);
  assert.match(readPhoto, /canvas\.width=Math\.max/);
  assert.match(readPhoto, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.doesNotMatch(readPhoto, /FileReader|readAsDataURL/);
  assert.match(usePhotos, /adminPreviewPhotos=selected/);
  assert.match(usePhotos, /for\(const file of files\)selected\.push\(await readPreviewPhoto\(file\)\)/);
  assert.doesNotMatch(usePhotos, /(?:^|[^\w])photos\s*=|saveSessionToGallery|persistSettings/);
  assert.match(previewImages, /while\(images\.length<3\)images\.push/);
  assert.match(previewImages, /return images\.slice\(0,3\)/);
  assert.doesNotMatch(previewImages, /loadImage/);

  assert.match(admin, /renderStrip\(ctx,c,images,s,adminOrientation,\{[\s\S]*?frameStyle:s\.stripFrame[\s\S]*?filterStyle:s\.stripFilter/);
  assert.match(admin, /const job=Polaroid\.compose\(\{[\s\S]*?images,/);
  assert.match(admin, /Covers\.render\(ctx,\{[\s\S]*?img:images\[Math\.min\(adminPreviewPhotoIndex,images\.length-1\)\]/);
  assert.match(admin, /template:s\.magazineTemplate\|\|"keepsake"/);
});

test("reduced motion holds Polaroids still until the guest explicitly plays", function () {
  var live = app.slice(app.indexOf("async function enterPolaroid"), app.indexOf("async function encodePolaroid"));
  var status = app.slice(app.indexOf("function polaroidStatus"), app.indexOf("async function enterPolaroid"));
  var admin = app.slice(app.indexOf("async function renderAdminPreview"), app.indexOf("function scheduleAdminPreview"));
  var playStart = app.indexOf('$("polaroidPlayBtn").onclick');
  var playHandler = app.slice(playStart, app.indexOf("\n};", playStart) + 3);

  assert.match(live, /const reduced=prefersReducedMotion\(\)&&!motionPlaybackRequested/);
  assert.match(live, /if\(reduced\)\{\s*polaroidJob\.drawStill\(ctx,0\);[\s\S]*?encodePolaroid\(token\);\s*return/);
  assert.match(admin, /if\(prefersReducedMotion\(\)&&!adminPreviewMotionRequested\)\{\s*job\.drawStill\(ctx,0\);[\s\S]*?playMotion\.hidden=false[\s\S]*?return/);
  assert.match(status, /const reducedReady=reduced&&\(polaroidState==="ready"\|\|polaroidState==="unsupported"\)/);
  assert.match(status, /play\.hidden=!\(reducedReady&&sharedOutputSession\)/);
  assert.match(html, /id="polaroidPlayBtn"[^>]*hidden>PLAY MOTION<\/button>/);
  assert.match(html, /id="adminPreviewPlayMotion"[^>]*hidden>PLAY MOTION<\/button>/);
  assert.match(playHandler, /motionPlaybackRequested=true/);
  assert.match(playHandler, /enterPolaroid\(\)/);
});

test("selected states, screen focus and host colours have explicit semantics", function () {
  var sync = app.slice(app.indexOf("function syncReviewModeUI"), app.indexOf("function resetCreativeState"));
  var controls = app.slice(app.indexOf("function buildReviewControls"), app.indexOf("let thumbToken"));
  var focus = app.slice(app.indexOf("function focusScreenHeading"), app.indexOf("function delay"));
  var setup = app.slice(app.indexOf("function setSetupStep"), app.indexOf("function openPersonalSettings"));
  var contrast = app.slice(app.indexOf("function colourLuminance"), app.indexOf("function eventMeta"));
  var themeSync = app.slice(app.indexOf("function syncThemeUI"), app.indexOf("function eventMeta"));

  assert.match(html, /id="reviewModeNav"[^>]*role="tablist"/);
  assert.match(sync, /setAttribute\("aria-selected",String\(selected\)\)/);
  assert.match(sync, /setAttribute\("aria-pressed",String\(selected\)\)/);
  assert.match(sync, /panel\.setAttribute\("aria-hidden",String\(!active\)\)/);
  assert.match(controls, /aria-label","Choose photo "\+\(i\+1\)\+" of "\+photos\.length\+" for the Magazine cover"/);
  assert.match(controls, /setAttribute\("aria-pressed",String\(coverIndex===i\)\)/);

  assert.match(focus, /const selectors=\{welcome:"#welcomeTitle",camera:"#cameraExperienceLabel",review:"#resultsKicker",settings:"#settingsTitle"\}/);
  assert.match(focus, /target\.focus\(\{preventScroll:id==="camera"\|\|id==="review"\}\)/);
  assert.match(focus, /if\(!options\|\|options\.focus!==false\)focusScreenHeading\(id\)/);
  assert.match(setup, /button\.setAttribute\("aria-selected",String\(active\)\)/);
  assert.match(setup, /button\.setAttribute\("aria-current","step"\)/);
  assert.match(setup, /heading\.focus\(\{preventScroll:false\}\)/);

  assert.match(contrast, /function contrastRatio\(first,second\)/);
  assert.match(contrast, /contrastRatio\(background,"#111111"\)>=contrastRatio\(background,"#ffffff"\)/);
  assert.match(contrast, /EVENT\.safeForeground\(background\)/);
  assert.match(contrast, /style\.setProperty\("--accent-ink",safeForeground\(theme\.primary\)\)/);
  assert.match(contrast, /style\.setProperty\("--event-accent-ink",safeForeground\(theme\.primary\)\)/);
  assert.match(themeSync, /document\.querySelectorAll\('input\[name="eventTheme"\]'\)/);
  assert.match(themeSync, /input\.checked=input\.value===theme\.id/);
  assert.match(themeSync, /--theme-background",option\.background/);
  assert.match(themeSync, /--theme-foreground",option\.foreground/);
  assert.match(themeSync, /--theme-button",option\.button/);
  assert.match(themeSync, /--theme-button-ink",option\.buttonInk/);
  assert.match(themeSync, /card\.dataset\.decoration=option\.decoration/);
  assert.match(themeSync, /card\.dataset\.typography=option\.typography/);
});

test("propagates one curated theme through host state and every personalised surface", function () {
  var defaults = app.slice(0, app.indexOf("const FRAMES"));
  var eventTheme = app.slice(app.indexOf("function applyEventTheme"), app.indexOf("function syncThemeUI"));
  var draft = app.slice(app.indexOf("function draftSettings"), app.indexOf("function releaseMediaStream"));
  var branding = app.slice(app.indexOf("function normaliseBranding"), app.indexOf("function setEntitlement"));
  var polaroidOptions = app.slice(app.indexOf("function polaroidOptions"), app.indexOf("function invalidatePolaroid"));
  var themeHandler = app.slice(app.indexOf("document.querySelectorAll('input[name=\"eventTheme\"]')"), app.indexOf('$("resetSettings")'));
  var panel = html.slice(html.indexOf('id="setupPanel1"'), html.indexOf('id="setupPanel2"'));
  var themeIds = Array.from(panel.matchAll(/name="eventTheme"[^>]*value="([^"]+)"/g), function (match) { return match[1]; });
  var expectedIds = ["pop", "after-dark", "editorial", "sunshine"];
  var defaultTheme = EventConfig.resolveTheme("pop");
  var afterDark = EventConfig.resolveTheme("after-dark");
  var editorial = EventConfig.resolveTheme("editorial");

  assert.match(defaults, /schemaVersion:3/);
  assert.match(defaults, new RegExp('themeId:"' + defaultTheme.id + '"'));
  assert.match(defaults, new RegExp('themePrimary:"' + defaultTheme.primary + '"', "i"));
  assert.match(defaults, new RegExp('themeSecondary:"' + defaultTheme.secondary + '"', "i"));
  assert.match(defaults, new RegExp('themeHighlight:"' + defaultTheme.highlight + '"', "i"));
  assert.match(defaults, new RegExp('themeBackground:"' + defaultTheme.background + '"', "i"));
  assert.match(defaults, new RegExp('themeForeground:"' + defaultTheme.foreground + '"', "i"));
  assert.doesNotMatch(defaults, /(?:^|\s)(?:look|accent):/m);

  assert.deepEqual(EventConfig.PALETTE_IDS, expectedIds);
  assert.deepEqual(EventConfig.THEME_IDS, expectedIds);
  assert.deepEqual(themeIds, expectedIds);
  assert.match(panel, /fieldset[^>]+aria-labelledby="chooseVibeTitle"[^>]+aria-describedby="eventThemeHelp"/);
  assert.equal((panel.match(/class="theme-card"/g) || []).length, 4);
  ["Pop", "After Dark", "Editorial", "Sunshine"].forEach(function (name) {
    assert.match(panel, new RegExp("<strong>" + name + "</strong>", "i"));
  });
  assert.doesNotMatch(panel, /id="setLook"|id="setAccent"|data-accent/);

  var afterDarkLuminances = [afterDark.primary, afterDark.secondary, afterDark.highlight,
    afterDark.background, afterDark.foreground, afterDark.button].map(relativeLuminance);
  assert.ok(Math.min.apply(Math, afterDarkLuminances) <= 0.08, "After Dark must contain a genuinely dark role");
  assert.ok(Math.max.apply(Math, afterDarkLuminances) >= 0.9, "After Dark must contain a genuinely white/light role");
  assert.ok([afterDark.primary, afterDark.secondary, afterDark.highlight, afterDark.background].some(function (colour) {
    return EventConfig.safeForeground(colour) === "#ffffff";
  }), "After Dark must derive white text for its dark role");

  ["pop", "after-dark", "sunshine"].forEach(function (id) {
    var other = EventConfig.resolveTheme(id);
    var differences = ["primary", "secondary", "highlight"].filter(function (role) {
      return editorial[role] !== other[role];
    });
    assert.ok(differences.length >= 2, "Editorial must materially differ from " + id);
  });
  expectedIds.forEach(function (id) {
    var theme = EventConfig.resolveTheme(id);
    [theme.primary, theme.secondary, theme.highlight, theme.background, theme.button, theme.border].forEach(function (background) {
      assert.ok(EventConfig.contrastRatio(background, EventConfig.safeForeground(background)) >= 4.5,
        id + " must derive a contrast-safe foreground for every role");
    });
    assert.ok(EventConfig.contrastRatio(theme.background, theme.foreground) >= 4.5,
      id + " must carry a safe Event Home foreground");
    assert.ok(EventConfig.contrastRatio(theme.button, theme.buttonInk) >= 4.5,
      id + " must carry safe button ink");
  });

  assert.match(eventTheme, /--event-surface",theme\.background/);
  assert.match(eventTheme, /--event-accent",theme\.primary/);
  assert.match(eventTheme, /--event-accent-ink",safeForeground\(theme\.primary\)/);
  assert.match(eventTheme, /--event-secondary",theme\.secondary/);
  assert.match(eventTheme, /--event-shape",theme\.highlight/);
  assert.match(eventTheme, /--event-ink",theme\.foreground/);
  assert.match(eventTheme, /--event-button",theme\.button/);
  assert.match(eventTheme, /--event-button-ink",theme\.buttonInk/);
  assert.match(eventTheme, /target\.dataset\.decoration=theme\.decoration/);
  assert.match(eventTheme, /target\.dataset\.typography=theme\.typography/);
  assert.match(draft, /input\[name="eventTheme"\]:checked/);
  assert.match(draft, /\.\.\.themeSettings\(theme\)/);
  assert.match(branding, /primaryColor:x\.primaryColor\|\|theme\.primary/);
  assert.match(branding, /secondaryColor:x\.secondaryColor\|\|theme\.highlight/);
  assert.match(polaroidOptions, /backdrop:theme\.background/);
  assert.ok((app.match(/accent:theme\.primary/g) || []).length >= 4);
  assert.ok((app.match(/accentInk:safeForeground\(theme\.primary\)/g) || []).length >= 3);
  assert.ok((app.match(/backdrop:theme\.background/g) || []).length >= 3);
  assert.match(themeHandler, /syncThemeUI\(input\.value\)/);
  assert.match(themeHandler, /applyThemeRendererDefaults\(input\.value\)/);
  assert.match(themeHandler, /applyRootTheme\(input\.value\)/);
  assert.match(themeHandler, /renderAdminPreview\(\)/);
  assert.doesNotMatch(app, /setLook|setAccent|data-accent|EVENT_LOOKS|settings\.accent|s\.accent/);
});

test("keeps Business output colours isolated while Personal previews stay curated", function () {
  var resolver = app.slice(app.indexOf("function outputTheme"), app.indexOf("function applyRootTheme"));
  var movingCapture = app.slice(app.indexOf("async function captureMovingPolaroid"), app.indexOf("async function beginSession"));
  var thumbnails = app.slice(app.indexOf("async function renderStyleThumbs"), app.indexOf("function setMode"));
  var magazine = app.slice(app.indexOf("function renderMagazine"), app.indexOf("function drawDraftPreview"));
  var polaroidOptions = app.slice(app.indexOf("function polaroidOptions"), app.indexOf("function invalidatePolaroid"));
  var stripRenderer = app.slice(app.indexOf("function renderStrip"), app.indexOf("window.MyBishBashRenderers"));
  var admin = app.slice(app.indexOf("async function renderAdminPreview"), app.indexOf("function scheduleAdminPreview"));

  assert.match(resolver, /if\(options&&options\.personal\)return theme/);
  assert.match(resolver, /entitlement===ENTITLEMENTS\.BUSINESS/);
  assert.match(resolver, /primary=businessBrand\.primaryColor\|\|theme\.primary/);
  assert.match(resolver, /secondary=businessBrand\.secondaryColor\|\|theme\.secondary/);
  assert.match(resolver, /return \{\.\.\.theme,primary,secondary,highlight:secondary,background:secondary/);
  assert.match(movingCapture, /const theme=outputTheme\(settings\)/);
  assert.match(thumbnails, /const theme=outputTheme\(settings\)/);
  assert.match(magazine, /theme=outputTheme\(settings\)/);
  assert.match(polaroidOptions, /const theme=outputTheme\(settings\)/);
  assert.match(stripRenderer, /outputTheme\(s,\{personal:creative&&\(creative\.themeMode==="personal"\|\|creative\.paletteMode==="personal"\)\}\)/);
  assert.match(admin, /themeMode:"personal"/);
  assert.match(marketing, /themeMode:"personal"/);
  assert.match(styles, /\.confetti:nth-child\(3n\)\{background:var\(--theme-secondary,/);
  assert.match(styles, /\.confetti:nth-child\(4n\)\{background:var\(--theme-highlight,/);
});

test("derives safe Magazine foregrounds without changing renderer geometry", function () {
  var press = covers.slice(covers.indexOf("function tplPress"), covers.indexOf("const RENDERERS"));
  var branding = covers.slice(covers.indexOf("function colourLuminance"), covers.indexOf("function render(ctx,opts)"));
  var render = covers.slice(covers.indexOf("function render(ctx,opts)"), covers.indexOf("/* Stand-in"));

  assert.match(press, /const \{ctx,W,H,u,M,land,copy,accent,accentInk\}=L/);
  assert.match(press, /ctx\.fillStyle=accent;ctx\.fillRect\(chip\.x,chip\.y,chip\.w,chip\.h\);\s*ctx\.fillStyle=accentInk/);
  assert.match(branding, /function contrastRatio\(first,second\)/);
  assert.match(branding, /function safeForeground\(background\)/);
  assert.match(branding, /const fg=safeForeground\(bg\)/);
  assert.doesNotMatch(branding, /hexLuma|>\.62/);
  assert.match(render, /accentInk:opts\.accentInk\|\|safeForeground\(accent\)/);
  assert.match(render, /\(RENDERERS\[opts\.template\]\|\|tplKeepsake\)\(L\)/);
});

test("collapses transient booth history and replaces example Event Home state", function () {
  var restore = app.slice(app.indexOf("function restoreHistorySurface"), app.indexOf("function handleHistoryChange"));
  var enterEvent = app.slice(app.indexOf("function enterEventHome"), app.indexOf("function enterBoothHistory"));
  var savePersonal = app.slice(app.indexOf("async function savePersonalSettings"), app.indexOf("function launchFreeBooth"));
  assert.match(restore, /next\.surface===HISTORY_SURFACE\.BOOTH[\s\S]*?history\.back&&history\.length>1[\s\S]*?history\.back\(\)/);
  assert.match(app, /let historyTransitionPending=false/);
  assert.match(app, /function handleHistoryChange\(event\)\{\s*historyTransitionPending=false/);
  assert.match(enterEvent, /current\.surface===HISTORY_SURFACE\.EVENT_HOME[\s\S]*?history\.replaceState\(next/);
  assert.ok(enterEvent.indexOf("history.replaceState") < enterEvent.indexOf("showEventHome(example,hostView)"));
  assert.match(savePersonal, /if\(boothExampleMode\)\{temporarySettingsSnapshot=null;boothExampleMode=false;\}/);
  assert.match(app, /function productBasePath\(\)[\s\S]*?location\.pathname\.replace\(\/\\\/business\\\/\?\$\/,"\/"\)/);
  assert.match(app, /function productURL\(route\)[\s\S]*?route==="business"[\s\S]*?"\/business":base/);
  assert.match(app, /const url=productURL\(productRoute\)/);
  assert.match(app, /history\.replaceState\(productHistoryState\(productRoute\),"",productURL\(productRoute\)\)/);
});

test("keeps magazine grading independent from Strip filters and older Safari canvas filters", function () {
  assert.match(app, /Covers\.applyGrade\(photoContext,destination\.x,destination\.y,destination\.w,destination\.h,filterCSS\(chosenFilter\)\)/);
  assert.doesNotMatch(covers.replace(/\/\*[\s\S]*?\*\//g, ""), /\.filter\s*=/);
  assert.doesNotMatch(polaroid.replace(/\/\*[\s\S]*?\*\//g, ""), /\.filter\s*=/);
  assert.doesNotMatch(app.replace(/\/\*[\s\S]*?\*\//g, ""), /\.filter\s*=/);
  assert.match(app, /Covers\.render\(ctx,\{/);
});

test("migrates legacy local data without deleting its source identifiers", function () {
  assert.match(app, /const SETTINGS_KEY="mybishbashPhotoboothSettingsV1"/);
  assert.match(app, /const LEGACY_SETTINGS_KEY="raePhotoBoothLiveSettings"/);
  assert.match(app, /const GALLERY_DB="mybishbashPhotoboothGallery"/);
  assert.match(app, /const LEGACY_GALLERY_DB="raePhotoBoothGallery"/);
  assert.match(app, /legacySettingsImported\|\|!!localStorage\.getItem\(LEGACY_SETTINGS_KEY\)/);
  assert.doesNotMatch(app, /deleteDatabase\(LEGACY_GALLERY_DB\)/);
  assert.doesNotMatch(app, /removeItem\(LEGACY_SETTINGS_KEY\)/);
});

test("persists migrated EventConfig identity and keeps Setup Passes sparse", function () {
  var load = app.slice(app.indexOf("function loadSettings"), app.indexOf("function colourLuminance"));
  var setupPass = app.slice(app.indexOf("async function setupPassLink"), app.indexOf("async function copySetupPass"));
  assert.match(load, /const serialised=JSON\.stringify\(migrated\)/);
  assert.match(load, /localStorage\.setItem\(SETTINGS_KEY,serialised\)/);
  assert.match(load, /delete eventDefaults\.eventType/);
  assert.match(load, /delete eventDefaults\.datePrecision/);
  assert.match(load, /delete eventDefaults\.schemaVersion/);
  assert.ok(
    app.indexOf("settings=loadSettings()") > app.indexOf("function migrateSettings"),
    "legacy migration constants must exist before settings are loaded"
  );
  assert.match(load, /Object\.keys\(eventDefaults\)\.filter\(key=>key\.startsWith\("theme"\)\)\.forEach\(key=>delete eventDefaults\[key\]\)/);
  assert.match(setupPass, /EVENT\.encodeSetupPass\(draft,\{defaults:DEFAULTS\}\)/);
});

test("keeps unpaid Personal drafts out of the real Free booth", function () {
  var pricingHandler = app.slice(
    app.indexOf('$("choosePersonalPlan").onclick'),
    app.indexOf('$("openPersonalSetup").onclick')
  );
  assert.match(pricingHandler, /showProductRoute\("personal",true\)/);
  assert.doesNotMatch(pricingHandler, /settings=draftSettings\(\)/);
  assert.match(app, /function launchFreeBooth\(\)\{[\s\S]*?restoreTemporarySettings\(\)/);
  assert.match(app, /!capabilities\.canPersonaliseEvent&&!legacyProfileAvailable[\s\S]*?settings=EVENT\?EVENT\.createEventConfig\(DEFAULTS/);
  assert.match(app, /function showProductRoute\(route,push,replace\)[\s\S]*?restoreTemporarySettings\(\)/);
});

test("requires a finite unexpired server token for cached Personal access", function () {
  assert.match(app, /Number\.isFinite\(expiry\)&&expiry>Date\.now\(\)/);
  assert.match(app, /if\(!accessToken\|\|!Number\.isFinite\(expiry\)\|\|expiry<=Date\.now\(\)\)return null/);
  assert.match(app, /personalPlans\.indexOf\(plan\)===-1/);
  assert.doesNotMatch(app, /!Number\.isFinite\(expiry\)\|\|expiry>Date\.now\(\)/);
});

test("caches the complete local-first product shell", function () {
  [
    "./product.js",
    "./marketing.js",
    "./assets/demo-photos.jpg",
    "./covers.js",
    "./polaroid.js",
    "./mp4.js",
    "./event.js",
    "./strip.js",
    "./motion.js",
    "./landing.js"
  ].forEach(function (asset) {
    assert.ok(serviceWorker.includes(JSON.stringify(asset)), asset + " must remain available offline");
  });
  assert.match(serviceWorker, /fetch\(request,\{cache:"no-store"\}\)/);
  assert.match(serviceWorker, /CACHEABLE_ASSET_URLS\.has\(cacheKey\.href\)/);
  assert.match(serviceWorker, /if\(cacheable&&response\.status===200/);
  assert.match(serviceWorker, /if\(cacheable\)\{[\s\S]*?cache\.match\(request\)/);
});

test("does not force-reload safe-worker booths or cache product API responses", function () {
  var legacySet = serviceWorker.slice(
    serviceWorker.indexOf("const LEGACY_CACHES"),
    serviceWorker.indexOf("self.addEventListener(\"install\"")
  );
  assert.match(legacySet, /rae-photo-booth-live-v7/);
  assert.doesNotMatch(legacySet, /rae-photo-booth-live-v(?:8|9|10|11)/);
  var assetList = serviceWorker.slice(serviceWorker.indexOf("const ASSETS"), serviceWorker.indexOf("const CACHEABLE_ASSET_URLS"));
  assert.doesNotMatch(assetList, /\/v1\//);
  assert.match(serviceWorker, /const CACHE="mybishbash-photobooth-v9"/);
});

test("keeps internal plans, tests and credentials out of the static deployment", function () {
  [".claude/", ".env*", "README.md", "WORK.md", "docs/", "tests/", "worker/", "package.json", "package-lock.json", "playwright.config.js"].forEach(function (entry) {
    assert.ok(vercelIgnore.split(/\r?\n/).includes(entry), entry + " must be excluded from the static artefact");
  });
});

test("loads capabilities before the booth and demo integrations", function () {
  var product = html.indexOf('src="product.js"');
  var appScript = html.indexOf('src="app.js"');
  var marketing = html.indexOf('src="marketing.js"');
  assert.ok(product >= 0 && appScript > product && marketing > appScript);
});

test("keeps every literal application DOM reference present and every id unique", function () {
  var ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), function (match) { return match[1]; });
  var idSet = new Set(ids);
  var references = Array.from(app.matchAll(/\$\("([^"]+)"\)/g), function (match) { return match[1]; });
  assert.equal(idSet.size, ids.length, "HTML ids must be unique");
  assert.deepEqual(references.filter(function (id) { return !idSet.has(id); }), []);
});