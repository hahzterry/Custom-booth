/* motion.js — deterministic short-motion capture for the Moving Polaroid.

   This module owns recording and timing only. The Polaroid renderer remains
   the single visual authority: callers provide one compositor for live
   camera frames and a second compositor for the exact final photograph.
   Recording is taken from that composed canvas, never directly from the
   camera stream, so no audio is included and source-camera tracks are never
   stopped here. */
(function (root, factory) {
  "use strict";

  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.MyBishBashMotion = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var DEFAULTS = Object.freeze({
    motionMs: 2500,
    holdMs: 1000,
    fps: 30
  });

  /* Safari is offered H.264 in an MP4 container first. Chromium and Firefox
     then get their strongest broadly implemented WebM option. The plain
     container variants are last-resort probes for engines that reject an
     otherwise valid codec-qualified string. */
  var MIME_CANDIDATES = Object.freeze([
    Object.freeze({ mime: 'video/mp4;codecs="avc1.42E01E"', extension: "mp4" }),
    Object.freeze({ mime: "video/mp4;codecs=avc1", extension: "mp4" }),
    Object.freeze({ mime: "video/mp4", extension: "mp4" }),
    Object.freeze({ mime: "video/webm;codecs=vp9", extension: "webm" }),
    Object.freeze({ mime: "video/webm;codecs=vp8", extension: "webm" }),
    Object.freeze({ mime: "video/webm", extension: "webm" })
  ]);

  var MESSAGES = Object.freeze({
    unsupported: "Moving moments are not available on this device. A still photo can still be saved.",
    cancelled: "The moving moment was cancelled.",
    interrupted: "The moving moment stopped when the page was left.",
    failed: "The moving moment could not be created. A still photo can still be saved."
  });

  function finitePositive(value, fallback) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function roundMilliseconds(value) {
    return Math.round(value * 1000) / 1000;
  }

  /* Durations are quantised to complete frames. That makes the final-photo
     hold testable and gives every supported frame rate one unambiguous plan. */
  function createPlan(options) {
    var source = options || {};
    var fps = Math.max(1, Math.min(60, Math.round(finitePositive(source.fps, DEFAULTS.fps))));
    var requestedMotionMs = finitePositive(source.motionMs, DEFAULTS.motionMs);
    var requestedHoldMs = finitePositive(source.holdMs, DEFAULTS.holdMs);
    var motionFrames = Math.max(1, Math.round(requestedMotionMs * fps / 1000));
    var holdFrames = Math.max(1, Math.round(requestedHoldMs * fps / 1000));
    var frameMs = 1000 / fps;
    var motionMs = roundMilliseconds(motionFrames * frameMs);
    var holdMs = roundMilliseconds(holdFrames * frameMs);

    return Object.freeze({
      fps: fps,
      frameMs: roundMilliseconds(frameMs),
      motionFrames: motionFrames,
      holdFrames: holdFrames,
      totalFrames: motionFrames + holdFrames,
      motionMs: motionMs,
      holdMs: holdMs,
      totalMs: roundMilliseconds(motionMs + holdMs)
    });
  }

  function asPlan(value) {
    return value && value.totalFrames && value.motionFrames && value.holdFrames ? value : createPlan(value);
  }

  /* Pure phase lookup used by both the recorder and UI/countdown work. The
     exact boundary belongs to the final photograph, never the live feed. */
  function timelineAt(elapsedMs, value) {
    var plan = asPlan(value);
    var raw = Number(elapsedMs);
    var elapsed = isFinite(raw) ? Math.max(0, raw) : 0;
    var clamped = Math.min(plan.totalMs, elapsed);
    var phase;
    var phaseProgress;

    if (elapsed < plan.motionMs) {
      phase = "motion";
      phaseProgress = plan.motionMs ? elapsed / plan.motionMs : 1;
    } else if (elapsed < plan.totalMs) {
      phase = "hold";
      phaseProgress = plan.holdMs ? (elapsed - plan.motionMs) / plan.holdMs : 1;
    } else {
      phase = "complete";
      phaseProgress = 1;
    }

    return Object.freeze({
      phase: phase,
      elapsedMs: clamped,
      phaseProgress: Math.max(0, Math.min(1, phaseProgress)),
      progress: plan.totalMs ? clamped / plan.totalMs : 1,
      useFinalStill: elapsed >= plan.motionMs
    });
  }

  function finalHold(value) {
    var plan = asPlan(value);
    return Object.freeze({
      startMs: plan.motionMs,
      endMs: plan.totalMs,
      durationMs: plan.holdMs,
      frames: plan.holdFrames
    });
  }

  function supportedFormats(Recorder) {
    if (!Recorder || typeof Recorder.isTypeSupported !== "function") return [];
    return MIME_CANDIDATES.filter(function (candidate) {
      try {
        return Recorder.isTypeSupported(candidate.mime);
      } catch (error) {
        return false;
      }
    });
  }

  function negotiateMime(Recorder) {
    var formats = supportedFormats(Recorder || root.MediaRecorder);
    return formats.length ? Object.freeze({
      mime: formats[0].mime,
      extension: formats[0].extension
    }) : null;
  }

  function stillOnly(code, message) {
    return Object.freeze({
      supported: false,
      mode: "still-only",
      code: code || "unsupported",
      message: message || MESSAGES.unsupported
    });
  }

  function inspectSupport(canvas, options) {
    var opts = options || {};
    var Recorder = opts.MediaRecorder || root.MediaRecorder;
    if (!canvas || typeof canvas.captureStream !== "function") return stillOnly();
    var format = negotiateMime(Recorder);
    if (!format) return stillOnly();
    return Object.freeze({
      supported: true,
      mode: "motion",
      mime: format.mime,
      extension: format.extension
    });
  }

  function MotionCaptureError(code, cause) {
    this.name = "MotionCaptureError";
    this.code = code || "failed";
    this.message = MESSAGES[this.code] || MESSAGES.failed;
    this.fallback = "still";
    this.stillOnly = true;
    if (cause !== undefined) this.cause = cause;
    if (Error.captureStackTrace) Error.captureStackTrace(this, MotionCaptureError);
  }
  MotionCaptureError.prototype = Object.create(Error.prototype);
  MotionCaptureError.prototype.constructor = MotionCaptureError;

  function isStillOnly(value) {
    return !!(value && (value.stillOnly === true || value.mode === "still-only"));
  }

  function addListener(target, type, handler) {
    if (!target || typeof target.addEventListener !== "function") return function () {};
    target.addEventListener(type, handler);
    return function () { target.removeEventListener(type, handler); };
  }

  function addRecorderListener(recorder, type, handler) {
    if (recorder && typeof recorder.addEventListener === "function") {
      recorder.addEventListener(type, handler);
      return function () { recorder.removeEventListener(type, handler); };
    }
    var key = "on" + type;
    recorder[key] = handler;
    return function () {
      if (recorder[key] === handler) recorder[key] = null;
    };
  }

  function uniqueTracks(streams) {
    var tracks = [];
    streams.forEach(function (stream) {
      if (!stream || typeof stream.getTracks !== "function") return;
      stream.getTracks().forEach(function (track) {
        if (tracks.indexOf(track) === -1) tracks.push(track);
      });
    });
    return tracks;
  }

  function extensionForMime(mime, fallback) {
    var value = String(mime || "").toLowerCase();
    if (value.indexOf("mp4") !== -1) return "mp4";
    if (value.indexOf("webm") !== -1) return "webm";
    return fallback;
  }

  function recordingStreamFor(captured, MediaStreamCtor) {
    var videoTracks = typeof captured.getVideoTracks === "function" ? captured.getVideoTracks() : [];
    if (!videoTracks.length && typeof captured.getTracks === "function") {
      videoTracks = captured.getTracks().filter(function (track) { return track.kind === "video"; });
    }
    if (!videoTracks.length) throw new MotionCaptureError("unsupported");

    /* Canvas streams should never contain audio, but constructing from the
       video tracks makes that guarantee explicit even under a browser shim. */
    if (typeof MediaStreamCtor === "function") return new MediaStreamCtor(videoTracks);
    if (typeof captured.getAudioTracks === "function") {
      captured.getAudioTracks().forEach(function (track) {
        try { track.stop(); } catch (error) {}
      });
    }
    return captured;
  }

  function defaultRequestFrame(callback) {
    if (typeof root.requestAnimationFrame === "function") return root.requestAnimationFrame(callback);
    return root.setTimeout(function () { callback(Date.now()); }, 1000 / DEFAULTS.fps);
  }

  function defaultCancelFrame(handle) {
    if (typeof root.cancelAnimationFrame === "function") root.cancelAnimationFrame(handle);
    else root.clearTimeout(handle);
  }

  function defaultNow() {
    return root.performance && typeof root.performance.now === "function" ? root.performance.now() : Date.now();
  }

  /* opts:
       canvas                         composed output canvas (required)
       drawMotionFrame(ctx, point)    live camera compositor (required)
       drawFinalStill(ctx, point)     exact final-photo compositor (required)
       signal                         optional AbortSignal
       motionMs / holdMs / fps        optional timing override
       onProgress(point)              optional UI hook

     Resolves to { blob, mime, extension, plan }. Unsupported devices and
     interrupted recordings reject with MotionCaptureError and fallback
     "still", allowing the caller to preserve the exact final photograph. */
  function record(options) {
    var opts = options || {};
    var canvas = opts.canvas;
    if (!canvas) return Promise.reject(new TypeError("A drawing canvas is required."));
    if (typeof opts.drawMotionFrame !== "function") {
      return Promise.reject(new TypeError("A live-frame drawing function is required."));
    }
    if (typeof opts.drawFinalStill !== "function") {
      return Promise.reject(new TypeError("A final-photo drawing function is required."));
    }

    var Recorder = opts.MediaRecorder || root.MediaRecorder;
    var support = inspectSupport(canvas, { MediaRecorder: Recorder });
    if (!support.supported) return Promise.reject(new MotionCaptureError("unsupported"));

    var plan = createPlan(opts);
    var context = opts.context || (typeof canvas.getContext === "function" && canvas.getContext("2d"));
    if (!context) return Promise.reject(new TypeError("The drawing canvas is unavailable."));
    var requestFrame = opts.requestFrame || defaultRequestFrame;
    var cancelFrame = opts.cancelFrame || defaultCancelFrame;
    var now = opts.now || defaultNow;
    var documentTarget = opts.document || root.document;
    var pageTarget = opts.pageTarget || root;
    var MediaStreamCtor = opts.MediaStream || root.MediaStream;
    var BlobCtor = opts.Blob || root.Blob;

    return new Promise(function (resolve, reject) {
      var capturedStream = null;
      var recorderStream = null;
      var recorder = null;
      var frameHandle = null;
      var startedAt = 0;
      var settled = false;
      var stoppingNormally = false;
      var chunks = [];
      var selected = null;
      var removeListeners = [];

      function cancelDrawLoop() {
        if (frameHandle === null) return;
        cancelFrame(frameHandle);
        frameHandle = null;
      }

      function stopTracks() {
        uniqueTracks([capturedStream, recorderStream]).forEach(function (track) {
          try { track.stop(); } catch (error) {}
        });
      }

      function detach() {
        while (removeListeners.length) {
          try { removeListeners.pop()(); } catch (error) {}
        }
      }

      function stopRecorder() {
        if (!recorder || recorder.state === "inactive") return;
        try { recorder.stop(); } catch (error) {}
      }

      function clean() {
        cancelDrawLoop();
        detach();
        stopTracks();
      }

      function fail(code, cause) {
        if (settled) return;
        settled = true;
        cancelDrawLoop();
        detach();
        stopRecorder();
        stopTracks();
        reject(cause instanceof MotionCaptureError ? cause : new MotionCaptureError(code, cause));
      }

      function finish() {
        if (settled) return;
        if (!stoppingNormally) {
          fail("failed");
          return;
        }
        if (!chunks.length || typeof BlobCtor !== "function") {
          fail("failed");
          return;
        }

        var firstType = chunks[0] && chunks[0].type;
        var outputMime = recorder.mimeType || firstType || selected.mime;
        var blob;
        try {
          blob = new BlobCtor(chunks, { type: outputMime });
        } catch (error) {
          fail("failed", error);
          return;
        }
        if (!blob.size) {
          fail("failed");
          return;
        }

        settled = true;
        clean();
        var mime = blob.type || outputMime;
        resolve(Object.freeze({
          status: "motion",
          blob: blob,
          mime: mime,
          extension: extensionForMime(mime, selected.extension),
          plan: plan
        }));
      }

      function draw(point) {
        if (point.useFinalStill) opts.drawFinalStill(context, point);
        else opts.drawMotionFrame(context, point);
        if (typeof opts.onProgress === "function") opts.onProgress(point);
      }

      function requestCanvasFrame() {
        if (!recorderStream || typeof recorderStream.getVideoTracks !== "function") return;
        var track = recorderStream.getVideoTracks()[0];
        if (track && typeof track.requestFrame === "function") {
          try { track.requestFrame(); } catch (error) {}
        }
      }

      function tick() {
        if (settled) return;
        frameHandle = null;
        var elapsed = Math.max(0, now() - startedAt);
        var point = timelineAt(elapsed, plan);
        try {
          draw(point);
          requestCanvasFrame();
        } catch (error) {
          fail("failed", error);
          return;
        }

        if (point.phase === "complete") {
          stoppingNormally = true;
          stopRecorder();
          return;
        }
        frameHandle = requestFrame(tick);
      }

      function interrupt(code) {
        fail(code || "interrupted");
      }

      try {
        if (opts.signal && opts.signal.aborted) throw new MotionCaptureError("cancelled");

        /* Seed the stream with a live frame. The exact motion/hold boundary
           is handled exclusively by timelineAt(), so no blended frame can
           leak into the final-photo hold. */
        draw(timelineAt(0, plan));
        capturedStream = canvas.captureStream(plan.fps);
        recorderStream = recordingStreamFor(capturedStream, MediaStreamCtor);

        var formats = supportedFormats(Recorder);
        var lastCreationError = null;
        for (var i = 0; i < formats.length; i++) {
          var candidate = formats[i];
          var recorderOptions = { mimeType: candidate.mime };
          if (finitePositive(opts.videoBitsPerSecond, 0)) {
            recorderOptions.videoBitsPerSecond = Number(opts.videoBitsPerSecond);
          }
          try {
            recorder = new Recorder(recorderStream, recorderOptions);
            selected = candidate;
            break;
          } catch (error) {
            lastCreationError = error;
          }
        }
        if (!recorder || !selected) throw new MotionCaptureError("failed", lastCreationError);

        removeListeners.push(addRecorderListener(recorder, "dataavailable", function (event) {
          if (!settled && event && event.data && event.data.size) chunks.push(event.data);
        }));
        removeListeners.push(addRecorderListener(recorder, "stop", finish));
        removeListeners.push(addRecorderListener(recorder, "error", function (event) {
          fail("failed", event && (event.error || event));
        }));

        if (opts.signal) {
          removeListeners.push(addListener(opts.signal, "abort", function () { interrupt("cancelled"); }));
        }
        removeListeners.push(addListener(documentTarget, "visibilitychange", function () {
          if (documentTarget.hidden === true || documentTarget.visibilityState === "hidden") {
            interrupt("interrupted");
          }
        }));
        removeListeners.push(addListener(pageTarget, "pagehide", function () { interrupt("interrupted"); }));
        removeListeners.push(addListener(pageTarget, "freeze", function () { interrupt("interrupted"); }));

        recorder.start();
        startedAt = now();
        frameHandle = requestFrame(tick);
      } catch (error) {
        fail(error && error.code ? error.code : "failed", error);
      }
    });
  }

  return Object.freeze({
    DEFAULTS: DEFAULTS,
    MIME_CANDIDATES: MIME_CANDIDATES,
    MotionCaptureError: MotionCaptureError,
    createPlan: createPlan,
    timelineAt: timelineAt,
    finalHold: finalHold,
    negotiateMime: negotiateMime,
    inspectSupport: inspectSupport,
    isStillOnly: isStillOnly,
    record: record
  });
});
