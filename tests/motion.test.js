"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Motion = require("../motion.js");

function recorderSupporting(accepted) {
  function Recorder() {}
  Recorder.isTypeSupported = function (mime) {
    return accepted.indexOf(mime) !== -1;
  };
  return Recorder;
}

function eventTarget() {
  var listeners = Object.create(null);
  return {
    addEventListener: function (type, handler) {
      (listeners[type] || (listeners[type] = [])).push(handler);
    },
    removeEventListener: function (type, handler) {
      var list = listeners[type] || [];
      var index = list.indexOf(handler);
      if (index !== -1) list.splice(index, 1);
    },
    dispatch: function (type) {
      (listeners[type] || []).slice().forEach(function (handler) { handler({ type: type }); });
    }
  };
}

function harness(options) {
  var opts = options || {};
  var time = 0;
  var scheduled = [];
  var cancelled = [];
  var videoTrack = {
    kind: "video",
    stopped: 0,
    requested: 0,
    stop: function () { this.stopped += 1; },
    requestFrame: function () { this.requested += 1; }
  };
  var unexpectedAudioTrack = {
    kind: "audio",
    stopped: 0,
    stop: function () { this.stopped += 1; }
  };
  var capture = {
    getTracks: function () { return [videoTrack, unexpectedAudioTrack]; },
    getVideoTracks: function () { return [videoTrack]; },
    getAudioTracks: function () { return [unexpectedAudioTrack]; }
  };
  var canvas = {
    getContext: function () { return { canvas: canvas }; },
    captureStream: function (fps) {
      canvas.capturedAt = fps;
      return capture;
    }
  };

  function VideoOnlyStream(tracks) {
    this.tracks = tracks.slice();
  }
  VideoOnlyStream.prototype.getTracks = function () { return this.tracks.slice(); };
  VideoOnlyStream.prototype.getVideoTracks = function () {
    return this.tracks.filter(function (track) { return track.kind === "video"; });
  };
  VideoOnlyStream.prototype.getAudioTracks = function () {
    return this.tracks.filter(function (track) { return track.kind === "audio"; });
  };

  var instances = [];
  function FakeRecorder(stream, recorderOptions) {
    this.stream = stream;
    this.options = recorderOptions;
    this.mimeType = recorderOptions.mimeType;
    this.state = "inactive";
    this.listeners = Object.create(null);
    this.stopCalls = 0;
    instances.push(this);
  }
  FakeRecorder.isTypeSupported = function (mime) {
    var accepted = opts.accepted || ['video/mp4;codecs="avc1.42E01E"'];
    return accepted.indexOf(mime) !== -1;
  };
  FakeRecorder.prototype.addEventListener = function (type, handler) {
    (this.listeners[type] || (this.listeners[type] = [])).push(handler);
  };
  FakeRecorder.prototype.removeEventListener = function (type, handler) {
    var list = this.listeners[type] || [];
    var index = list.indexOf(handler);
    if (index !== -1) list.splice(index, 1);
  };
  FakeRecorder.prototype.emit = function (type, event) {
    (this.listeners[type] || []).slice().forEach(function (handler) { handler(event || {}); });
  };
  FakeRecorder.prototype.start = function () { this.state = "recording"; };
  FakeRecorder.prototype.stop = function () {
    this.stopCalls += 1;
    this.state = "inactive";
    if (opts.emitData !== false) {
      this.emit("dataavailable", { data: new Blob(["moving keepsake"], { type: this.mimeType }) });
    }
    this.emit("stop");
  };

  function requestFrame(callback) {
    var item = { id: scheduled.length + 1, callback: callback, cancelled: false };
    scheduled.push(item);
    return item.id;
  }
  function cancelFrame(id) {
    cancelled.push(id);
    scheduled.forEach(function (item) {
      if (item.id === id) item.cancelled = true;
    });
  }
  function step(nextTime) {
    time = nextTime;
    var item = scheduled.shift();
    while (item && item.cancelled) item = scheduled.shift();
    assert.ok(item, "a draw frame should be scheduled");
    item.callback(nextTime);
  }

  var pageTarget = eventTarget();
  var documentTarget = eventTarget();
  documentTarget.hidden = false;
  documentTarget.visibilityState = "visible";

  return {
    canvas: canvas,
    videoTrack: videoTrack,
    audioTrack: unexpectedAudioTrack,
    instances: instances,
    requestFrame: requestFrame,
    cancelFrame: cancelFrame,
    cancelled: cancelled,
    step: step,
    now: function () { return time; },
    MediaRecorder: FakeRecorder,
    MediaStream: VideoOnlyStream,
    pageTarget: pageTarget,
    documentTarget: documentTarget
  };
}

test("prefers MP4/H.264 before WebM and falls back from VP9 to VP8", function () {
  var all = Motion.MIME_CANDIDATES.map(function (candidate) { return candidate.mime; });
  var preferred = Motion.negotiateMime(recorderSupporting(all));
  assert.equal(preferred.mime, 'video/mp4;codecs="avc1.42E01E"');
  assert.equal(preferred.extension, "mp4");

  var vp9 = Motion.negotiateMime(recorderSupporting(["video/webm;codecs=vp9", "video/webm;codecs=vp8"]));
  assert.deepEqual(vp9, { mime: "video/webm;codecs=vp9", extension: "webm" });

  var vp8 = Motion.negotiateMime(recorderSupporting(["video/webm;codecs=vp8"]));
  assert.deepEqual(vp8, { mime: "video/webm;codecs=vp8", extension: "webm" });
  assert.equal(Motion.negotiateMime(recorderSupporting([])), null);
});

test("builds a deterministic 2.5 second motion plus 1 second final hold", function () {
  var plan = Motion.createPlan();
  assert.deepEqual(plan, {
    fps: 30,
    frameMs: 33.333,
    motionFrames: 75,
    holdFrames: 30,
    totalFrames: 105,
    motionMs: 2500,
    holdMs: 1000,
    totalMs: 3500
  });
  assert.deepEqual(Motion.finalHold(plan), {
    startMs: 2500,
    endMs: 3500,
    durationMs: 1000,
    frames: 30
  });
  assert.equal(Motion.timelineAt(2499, plan).phase, "motion");
  assert.equal(Motion.timelineAt(2499, plan).useFinalStill, false);
  assert.equal(Motion.timelineAt(2500, plan).phase, "hold");
  assert.equal(Motion.timelineAt(2500, plan).useFinalStill, true);
  assert.equal(Motion.timelineAt(3500, plan).phase, "complete");
  assert.equal(Motion.timelineAt(3500, plan).useFinalStill, true);
});

test("uses only the exact final-still hook throughout the hold and returns blob metadata", async function () {
  var h = harness();
  var live = [];
  var still = [];
  var resultPromise = Motion.record({
    canvas: h.canvas,
    MediaRecorder: h.MediaRecorder,
    MediaStream: h.MediaStream,
    pageTarget: h.pageTarget,
    document: h.documentTarget,
    now: h.now,
    requestFrame: h.requestFrame,
    cancelFrame: h.cancelFrame,
    drawMotionFrame: function (ctx, point) { live.push(point.elapsedMs); },
    drawFinalStill: function (ctx, point) { still.push(point.elapsedMs); }
  });

  h.step(1000);
  h.step(2499);
  h.step(2500);
  h.step(3000);
  h.step(3500);
  var result = await resultPromise;

  assert.deepEqual(live, [0, 1000, 2499]);
  assert.deepEqual(still, [2500, 3000, 3500]);
  assert.equal(result.status, "motion");
  assert.ok(result.blob instanceof Blob);
  assert.ok(result.blob.size > 0);
  assert.equal(result.mime, 'video/mp4;codecs="avc1.42e01e"');
  assert.equal(result.blob.type, result.mime);
  assert.equal(result.extension, "mp4");
  assert.equal(result.plan.totalMs, 3500);
  assert.equal(h.canvas.capturedAt, 30);
  assert.equal(h.instances[0].stream.getAudioTracks().length, 0, "the recorder receives no audio tracks");
  assert.equal(h.videoTrack.stopped, 1, "the derived canvas track is cleaned after success");
});

test("abort stops the recorder, cancels drawing and cleans derived tracks", async function () {
  var h = harness();
  var controller = new AbortController();
  var resultPromise = Motion.record({
    canvas: h.canvas,
    MediaRecorder: h.MediaRecorder,
    MediaStream: h.MediaStream,
    pageTarget: h.pageTarget,
    document: h.documentTarget,
    signal: controller.signal,
    now: h.now,
    requestFrame: h.requestFrame,
    cancelFrame: h.cancelFrame,
    drawMotionFrame: function () {},
    drawFinalStill: function () {}
  });

  controller.abort();
  await assert.rejects(resultPromise, function (error) {
    assert.equal(error.name, "MotionCaptureError");
    assert.equal(error.code, "cancelled");
    assert.equal(error.fallback, "still");
    assert.equal(Motion.isStillOnly(error), true);
    return true;
  });
  assert.equal(h.instances[0].stopCalls, 1);
  assert.equal(h.videoTrack.stopped, 1);
  assert.ok(h.cancelled.length > 0);
});

test("page hiding aborts safely and unsupported devices expose a still-only boundary", async function () {
  var unsupported = Motion.inspectSupport({});
  assert.deepEqual(unsupported, {
    supported: false,
    mode: "still-only",
    code: "unsupported",
    message: "Moving moments are not available on this device. A still photo can still be saved."
  });
  assert.equal(Motion.isStillOnly(unsupported), true);

  var h = harness();
  var resultPromise = Motion.record({
    canvas: h.canvas,
    MediaRecorder: h.MediaRecorder,
    MediaStream: h.MediaStream,
    pageTarget: h.pageTarget,
    document: h.documentTarget,
    now: h.now,
    requestFrame: h.requestFrame,
    cancelFrame: h.cancelFrame,
    drawMotionFrame: function () {},
    drawFinalStill: function () {}
  });
  h.documentTarget.hidden = true;
  h.documentTarget.visibilityState = "hidden";
  h.documentTarget.dispatch("visibilitychange");

  await assert.rejects(resultPromise, function (error) {
    assert.equal(error.code, "interrupted");
    assert.equal(error.fallback, "still");
    return true;
  });
  assert.equal(h.instances[0].stopCalls, 1);
  assert.equal(h.videoTrack.stopped, 1);
});
