"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "..");
function source(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

var app = source("app.js");
var html = source("index.html");

/* Extract one declaration by balanced braces so each assertion stays within
   the behaviour it protects. This deliberately avoids a regex spanning most
   of app.js, which would turn unrelated refactors into false failures. */
function functionSource(name) {
  var signature = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\(");
  var match = signature.exec(app);
  assert.ok(match, "missing function " + name);
  var start = match.index;
  var brace = app.indexOf("{", start + match[0].length);
  assert.ok(brace >= 0, "missing function body for " + name);

  var depth = 0;
  var quote = "";
  var escaped = false;
  var lineComment = false;
  var blockComment = false;
  for (var index = brace; index < app.length; index += 1) {
    var char = app[index];
    var next = app[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return app.slice(start, index + 1);
    }
  }
  assert.fail("unterminated function " + name);
}

function section(id) {
  var start = html.indexOf('<section id="' + id + '"');
  assert.ok(start >= 0, "missing #" + id + " section");
  var end = html.indexOf("</section>", start);
  assert.ok(end > start, "unterminated #" + id + " section");
  return html.slice(start, end + 10);
}

function handlerLine(id) {
  var marker = '$("' + id + '").onclick';
  var start = app.indexOf(marker);
  assert.ok(start >= 0, "missing click handler for #" + id);
  return app.slice(start, app.indexOf("\n", start));
}

test("public and event entry both start the shared capture directly", function () {
  var free = functionSource("launchFreeBooth");
  var event = functionSource("enterGuestBooth");

  assert.doesNotMatch(html, /<section id="experience"/);
  assert.doesNotMatch(html, /data-experience=/);
  assert.match(free, /setBoothReturnScreen\("landing"\)/);
  assert.match(free, /enterBoothHistory\(\);beginSharedSession\(false\)/);
  assert.match(event, /setBoothReturnScreen\("welcome"\)/);
  assert.match(event, /enterBoothHistory\(\)/);
  assert.match(event, /beginSharedSession\(false\)/);
});

test("a shared session captures exactly three stills for every output", function () {
  var shared = functionSource("beginSharedSession");
  var session = functionSource("beginSession");

  assert.match(shared, /return beginSession\("shared",\{retake:!!retake,purpose:options&&options\.purpose\}\)/);
  assert.match(session, /const shared=experience==="shared"/);
  assert.match(session, /resetCreativeState\(shared\?"strip":\(experience\|\|currentExperience\)\)/);
  assert.match(session, /\$\("stripFramingGuide"\)\.hidden=!\(shared\|\|currentExperience==="strip"\)/);
  assert.match(session, /const total=shared\|\|currentExperience==="strip"\?3:1/);
  assert.match(session, /for\(let i=0;i<total;i\+\+\)/);
  assert.match(session, /photos\.push\(capturePhoto\(\)\)/);
  assert.match(session, /saveSessionToGallery\(photos,sessionOrientation,shared\?"shared":currentExperience,replaceId\)/);
});

test("Review offers Strip, Magazine and Polaroid after the shared capture", function () {
  var review = section("review");
  var reset = functionSource("resetCreativeState");
  var setMode = functionSource("setMode");
  var render = functionSource("render");
  var modes = Array.from(review.matchAll(/data-mode="([^"]+)"/g), function (match) {
    return match[1];
  });

  assert.deepEqual(modes, ["strip", "magazine", "polaroid"]);
  assert.match(review, /id="reviewModeNav"[^>]*aria-label="Choose output"/);
  assert.match(reset, /\$\("reviewModeNav"\)\.hidden=!sharedOutputSession/);
  assert.match(setMode, /currentMode=mode/);
  assert.match(setMode, /if\(mode==="polaroid"\)\{enterPolaroid\(\);resetIdle\(\);return;\}/);
  assert.match(setMode, /leavePolaroid\(\);[\s\S]*?renderWithFade\(\);resetIdle\(\)/);
  assert.doesNotMatch(setMode, /mode==="magazine"&&coverIndex===null/);
  assert.match(render, /if\(currentMode!=="magazine"\|\|coverIndex===null\)renderStrip\(ctx,c,imgs,settings,sessionOrientation\)/);
  assert.match(app, /document\.querySelectorAll\("\.mode-tab"\)\.forEach\(b=>b\.onclick=\(\)=>setMode\(b\.dataset\.mode\)\)/);
});

test("Magazine asks for a favourite from all three captured photos", function () {
  var reset = functionSource("resetCreativeState");
  var controls = functionSource("buildReviewControls");
  var thumbnails = functionSource("renderStyleThumbs");
  var ready = functionSource("exportReady");

  assert.match(reset, /coverIndex=null/);
  assert.match(controls, /photos\.forEach\(\(src,i\)=>\{/);
  assert.match(controls, /b\.dataset\.photoIndex=String\(i\)/);
  assert.match(controls, /b\.onclick=\(\)=>\{[\s\S]*?coverIndex=i/);
  assert.match(controls, /\$\("coverPhotoChoices"\)\.appendChild\(b\)/);
  assert.match(thumbnails, /loadImage\(photos\[coverIndex\]\)/);
  assert.match(thumbnails, /const theme=outputTheme\(settings\)/);
  assert.match(thumbnails, /accent:theme\.primary,accentInk:safeForeground\(theme\.primary\)/);
  assert.match(ready, /if\(currentMode==="magazine"&&coverIndex===null\)return false/);
});

test("Moving Polaroid composes all three shared photos for preview, motion and still", function () {
  var enter = functionSource("enterPolaroid");
  var preview = functionSource("startPolaroidPreviewLoop");
  var handoff = functionSource("queuePolaroidVideoHandoff");
  var encode = functionSource("encodePolaroid");
  var still = functionSource("polaroidPrintBlob");
  var options = functionSource("polaroidOptions");
  var admin = app.slice(app.indexOf("async function renderAdminPreview"), app.indexOf("function scheduleAdminPreview"));

  assert.match(enter, /const imgs=await Promise\.all\(photos\.map\(loadImage\)\)/);
  assert.match(enter, /encodedReady=!!\(sharedOutputSession&&polaroidVideoBlob&&polaroidVideoUrl\)/);
  assert.match(enter, /Polaroid\.compose\(Object\.assign\(\{base:POLAROID_VIDEO_BASE\},polaroidOptions\(imgs\)\)\)/);
  assert.match(enter, /startPolaroidPreviewLoop\(token,ctx\)/);
  assert.match(enter, /if\(encodedReady\)queuePolaroidVideoHandoff\(token,polaroidJob\)/);
  assert.match(enter, /encodePolaroid\(token\)/);
  assert.match(preview, /polaroidJob\.drawAt\(ctx,polaroidPreviewSeconds\(polaroidPreviewEpoch\)\)/);
  assert.match(preview, /polaroidJob\.drawAt\(ctx,polaroidPreviewSeconds\(\)\)/);
  assert.match(handoff, /Polaroid\.timeToSeam\(polaroidPreviewSeconds\(\),duration\)/);
  assert.match(handoff, /const tolerance=2\/POLAROID_FPS/);
  assert.match(handoff, /v\.autoplay=false/);
  assert.match(handoff, /v\.currentTime=0/);
  assert.match(handoff, /v\.onseeked=beginPlayback/);
  assert.match(handoff, /v\.onplaying=complete/);
  assert.match(handoff, /if\(state\.a!==0\|\|state\.b!==0\)/);
  assert.match(handoff, /playback\.then\(complete\)\.catch/);
  assert.match(handoff, /document\.visibilityState!=="visible"/);
  assert.match(handoff, /document\.addEventListener\("visibilitychange",polaroidVisibilityHandler\)/);
  assert.match(handoff, /stopPolaroidLoop\(\);\s*c\.hidden=true;v\.hidden=false/);
  assert.match(encode, /queuePolaroidVideoHandoff\(token,job\)/);
  assert.doesNotMatch(encode, /onloadeddata=swap|onplaying=swap/, "encoded output cannot replace the canvas at an arbitrary phase");
  assert.match(admin, /if\(!adminPolaroidPreviewEpoch\)adminPolaroidPreviewEpoch=performance\.now\(\)/);
  assert.match(admin, /job\.timeline\.previewStart\|\|0\)\+\(performance\.now\(\)-epoch\)\/1000/);
  assert.match(still, /const imgs=await Promise\.all\(photos\.map\(loadImage\)\)/);
  assert.match(still, /Polaroid\.compose\(Object\.assign\(\{base:POLAROID_PRINT_BASE\},polaroidOptions\(imgs\)\)\)/);
  assert.match(still, /job\.drawStill\(ctx,0\)/);
  assert.match(options, /const theme=outputTheme\(settings\)/);
  assert.match(options, /backdrop:theme\.background/);
});

test("Next Guest starts fresh while Retake replaces the current shared session", function () {
  var session = functionSource("beginSession");
  var restart = functionSource("restartCurrentSession");

  assert.equal(handlerLine("nextGuestBtn").trim(), '$("nextGuestBtn").onclick=()=>beginSharedSession(false);');
  assert.equal(handlerLine("retakeBtn").trim(), '$("retakeBtn").onclick=restartCurrentSession;');
  assert.match(restart, /const options=\{retake:true,purpose:activeCapturePurpose\}/);
  assert.match(restart, /sharedOutputSession\?beginSharedSession\(true,options\):beginSession\(currentExperience,options\)/);
  assert.match(session, /const retaking=!!\(options&&options\.retake\)/);
  assert.match(session, /const replaceId=shared&&retaking&&!isHostTest\?activeGalleryRecordId:null/);
  assert.match(session, /if\(!replacingRecord\)activeGalleryRecordId=null/);
  assert.match(session, /photos=\[\]/);
  assert.match(session, /if\(!isHostTest\)\{[\s\S]*?saveSessionToGallery\(photos,sessionOrientation,shared\?"shared":currentExperience,replaceId\)/);
  assert.match(session, /if\(!isHostTest\)\{[\s\S]*?if\(!replacingRecord\)\{[\s\S]*?sessionEdition=nextEditionNumber\(galleryCount\)/);
});

test("capture purpose is memory-only and Retake preserves host-test isolation", function () {
  var defaults = app.slice(0, app.indexOf("const FRAMES"));
  var globals = app.slice(app.indexOf("let settings;"), app.indexOf("const $="));
  var persist = functionSource("persistSettings");
  var restart = functionSource("restartCurrentSession");
  var teardown = functionSource("teardownBoothSession");

  assert.match(globals, /let activeCapturePurpose="guest"/);
  assert.doesNotMatch(defaults, /activeCapturePurpose|hostTestContext|adminPreviewPhotos/);
  assert.match(persist, /JSON\.stringify\(settings\)/);
  assert.doesNotMatch(persist, /activeCapturePurpose|hostTestContext/);
  assert.doesNotMatch(app, /localStorage\.(?:setItem|getItem)\([^\n;]*activeCapturePurpose/);
  assert.match(restart, /purpose:activeCapturePurpose/);
  assert.match(teardown, /activeCapturePurpose="guest"/);
});

test("only real guest captures mutate gallery and edition state", function () {
  var session = functionSource("beginSession");
  var guestStart = session.indexOf("if(!isHostTest){");
  var hostStart = session.indexOf("}else{", guestStart);
  var persistenceEnd = session.indexOf('if(currentExperience==="magazine")', hostStart);
  var guestPersistence = session.slice(guestStart, hostStart);
  var hostPersistence = session.slice(hostStart, persistenceEnd);

  assert.ok(guestStart >= 0 && hostStart > guestStart && persistenceEnd > hostStart);
  assert.match(session, /const purpose=options&&options\.purpose==="host-test"\?"host-test":"guest"/);
  assert.match(session, /const replaceId=shared&&retaking&&!isHostTest\?activeGalleryRecordId:null/);
  assert.match(guestPersistence, /saveSessionToGallery\(photos,sessionOrientation,shared\?"shared":currentExperience,replaceId\)/);
  assert.match(guestPersistence, /if\(galleryRecord\)activeGalleryRecordId=galleryRecord\.id/);
  assert.match(guestPersistence, /if\(!replacingRecord\)\{[\s\S]*?countGallerySessions\(\)[\s\S]*?nextEditionNumber\(galleryCount\)/);
  assert.doesNotMatch(hostPersistence, /saveSessionToGallery|countGallerySessions|nextEditionNumber/);
  assert.match(hostPersistence, /activeGalleryRecordId=null/);
});

test("host camera test reuses shared capture and exits to the same host surface", function () {
  var start = functionSource("startHostCameraTest");
  var exit = functionSource("exitHostTestPreview");
  var preview = functionSource("previewEventAsGuest");
  var session = functionSource("beginSession");

  assert.match(start, /draft=await configuredDraftFromForm\(\)/);
  assert.match(start, /const guestPinDraft=target==="settings"&&\$\("setGuestPin"\)\?\$\("setGuestPin"\)\.value:""/);
  assert.match(start, /draftSettings:draft,\s*guestPinDraft/);
  assert.match(start, /enterHostTestHistory\(hostTestContext\)/);
  assert.match(start, /activeCapturePurpose="host-test"/);
  assert.match(start, /beginSharedSession\(false,\{purpose:"host-test"\}\)/);
  assert.doesNotMatch(start, /EVENT\.startEvent|persistSettings|saveSessionToGallery/);
  assert.match(session, /if\(EVENT&&eventIsPersonalised\(\)&&!isHostTest\)/);
  assert.match(session, /const total=shared\|\|currentExperience==="strip"\?3:1/);
  assert.match(session, /buildReviewControls\(\)[\s\S]*?showScreen\("review"\)/);

  assert.match(exit, /context\.returnScreen==="settings"/);
  assert.match(exit, /showScreen\("settings"\)/);
  assert.match(exit, /\$\("setGuestPin"\)\.value=context\.guestPinDraft\|\|""/);
  assert.match(exit, /setSetupStep\(context\.setupStep,\{focus:false\}\)/);
  assert.match(exit, /showEventHome\(boothExampleMode,true\)/);
  assert.match(exit, /hostView:true/);
  assert.doesNotMatch(exit, /persistSettings|EVENT\.startEvent/);
  assert.match(preview, /startHostCameraTest\("welcome"\)/);
  assert.doesNotMatch(preview, /hostView:false|updateWelcomeMode\(false\)/);
  assert.match(html, /id="exitTestPreview"[^>]*>BACK TO EVENT SETUP<\/button>/);
  assert.match(app, /function enterHostTestHistory\(context\)[\s\S]*?hostTest:true/);
  assert.match(app, /function requestHostTestExit\(\)[\s\S]*?history\.back\(\)/);
  assert.match(app, /\$\("exitTestPreview"\)\.onclick=requestHostTestExit/);
  assert.match(app, /\$\("closeSettings"\)\.onclick=\(\)=>\{fillSettingsUI\(\);showScreen\(settingsReturnScreen\|\|"landing"\);\}/);
});

test("Next Guest clears Business delivery details while Retake preserves them", function () {
  var session = functionSource("beginSession");
  var resetGuest = functionSource("resetGuestCompletionState");

  assert.equal(handlerLine("nextGuestBtn").trim(), '$("nextGuestBtn").onclick=()=>beginSharedSession(false);');
  assert.match(session, /const retaking=!!\(options&&options\.retake\)/);
  assert.match(session, /if\(!retaking\)resetGuestCompletionState\(true\)/);
  assert.match(resetGuest, /businessCompletionSatisfied=false/);
  assert.match(resetGuest, /if\(!clearFields\)return/);
  assert.match(resetGuest, /const email=\$\("guestEmail"\),marketing=\$\("guestMarketingConsent"\),publicity=\$\("guestPublicityConsent"\)/);
  assert.match(resetGuest, /if\(email\)email\.value=""/);
  assert.match(resetGuest, /if\(marketing\)marketing\.checked=false/);
  assert.match(resetGuest, /if\(publicity\)publicity\.checked=false/);
});

test("Event Home remains an explicit exit from capture and Review", function () {
  var label = functionSource("setBoothReturnScreen");
  var cancel = functionSource("cancelCapture");
  var returnHome = functionSource("showBoothReturnScreen");

  assert.match(label, /boothReturnScreen==="welcome"\?"Event Home":"Home"/);
  assert.match(label, /button\.setAttribute\("aria-label",label\+\(boothReturnScreen==="welcome"\?" — return to this event's welcome screen"/);
  assert.match(cancel, /showBoothReturnScreen\(\)/);
  assert.equal(handlerLine("boothHomeBtn").trim(), '$("boothHomeBtn").onclick=showBoothReturnScreen;');
  assert.match(returnHome, /boothReturnScreen==="welcome"/);
  assert.match(returnHome, /showEventHome\(boothExampleMode,false\)/);
  assert.match(returnHome, /surface:HISTORY_SURFACE\.EVENT_HOME/);
});

test("Review mode UI stays in sync and exposes the exact Polaroid still action", function () {
  var sync = functionSource("syncReviewModeUI");
  var stillHandler = handlerLine("stillPhotoBtn");
  var handlerStart = app.indexOf(stillHandler);
  var handlerEnd = app.indexOf("\n};", handlerStart);
  var handler = app.slice(handlerStart, handlerEnd + 3);

  assert.match(sync, /document\.querySelectorAll\("\.mode-tab"\)/);
  assert.match(sync, /\[\["stripControls","strip"\],\["magazineControls","magazine"\],\["polaroidControls","polaroid"\]\]/);
  assert.match(sync, /panel\.classList\.toggle\("active",active\)/);
  assert.match(sync, /panel\.setAttribute\("aria-hidden",String\(!active\)\)/);
  assert.match(sync, /const awaitingMagazine=currentMode==="magazine"&&coverIndex===null/);
  assert.match(sync, /\$\("stillPhotoBtn"\)\.hidden=currentMode!=="polaroid"/);
  assert.match(html, /id="stillPhotoBtn"[^>]*hidden>Still photo<\/button>/);
  assert.match(handler, /polaroidPrintBlob\(\)/);
  assert.match(handler, /download\(blob,"png"\)/);
  assert.match(handler, /const exportSession=captureSessionId/);
  assert.match(handler, /if\(exportSession!==captureSessionId\)return/);
  assert.doesNotMatch(handler, /motionCaptureBlob|polaroidVideoBlob/);
});

test("export controls guard unfinished Magazine choices and stale guest results", function () {
  var ready = functionSource("exportReady");
  var refresh = functionSource("refreshExportControls");
  var session = functionSource("beginSession");
  var teardown = functionSource("teardownBoothSession");
  var share = functionSource("shareCurrent");
  var save = functionSource("saveCurrent");

  assert.match(ready, /if\(currentMode==="magazine"&&coverIndex===null\)return false/);
  assert.match(ready, /if\(currentMode==="polaroid"&&polaroidState!=="ready"&&polaroidState!=="unsupported"\)return false/);
  assert.match(ready, /return true/);
  assert.match(refresh, /const ready=exportReady\(\)&&!exportBusy/);
  assert.match(refresh, /button\.disabled=!ready/);
  assert.match(refresh, /document\.querySelectorAll\("\.mode-tab,\.choice,\.photo-choice,\.mag-style-choice,#changeCoverPhoto,#stillPhotoBtn"\)/);
  assert.match(refresh, /button\.disabled=exportBusy/);
  assert.match(teardown, /captureSessionId\+\+/);
  assert.match(teardown, /exportBusy=false/);
  assert.match(session, /captureSessionId\+\+[\s\S]*?exportBusy=false/);
  [share, save].forEach(function (operation) {
    assert.match(operation, /if\(exportBusy\|\|!exportReady\(\)\)return/);
    assert.match(operation, /const exportSession=captureSessionId/);
    assert.match(operation, /if\(exportSession!==captureSessionId\)return/);
    assert.match(operation, /if\(exportSession===captureSessionId\)\{exportBusy=false;refreshExportControls\(\);\}/);
  });
  assert.match(share, /const video=currentMode==="polaroid"&&polaroidVideoBlob/);
  assert.match(save, /if\(currentMode==="polaroid"&&polaroidVideoBlob\)/);
});
