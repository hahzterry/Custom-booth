/* mp4.js — a tiny H.264 MP4 writer for the Living Polaroid.

   Scope is deliberately one keepsake-shaped video and nothing more: a single
   video track, constant frame duration, every sample in one chunk. That lets
   the whole muxer be a couple of hundred lines with no dependency, which is
   the right trade in a repo that has no build step and no node_modules.

   Two encoders, probed in order:
     1. WebCodecs — deterministic. Frame N gets exactly the timestamp we say,
        so the loop lands on the frame we authored. ~1s for a 4s clip.
     2. MediaRecorder — real time, variable frame rate, at the mercy of rAF.
        Only Safari emits MP4 from it, which is fine: Safari is the booth.
   Neither available means no video; the caller falls back to the PNG. */
(function(global){
"use strict";

/* ---------- box writing ---------- */

function bytes(){return new Uint8Array(Array.prototype.slice.call(arguments));}
function u16(v){return new Uint8Array([v>>8&255,v&255]);}
function u32(v){return new Uint8Array([v>>>24&255,v>>>16&255,v>>>8&255,v&255]);}
function str(s){const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i)&255;return a;}
function zeros(n){return new Uint8Array(n);}
function concat(parts){
  let n=0;for(const p of parts)n+=p.length;
  const out=new Uint8Array(n);let at=0;
  for(const p of parts){out.set(p,at);at+=p.length;}
  return out;
}
function box(type){
  const body=concat(Array.prototype.slice.call(arguments,1));
  return concat([u32(body.length+8),str(type),body]);
}
function fullBox(type,version,flags){
  const rest=Array.prototype.slice.call(arguments,3);
  return box.apply(null,[type,bytes(version,flags>>16&255,flags>>8&255,flags&255)].concat(rest));
}
/* Unity matrix, 16.16 fixed except the last cell which is 2.30. */
const MATRIX=concat([u32(0x00010000),u32(0),u32(0),u32(0),u32(0x00010000),u32(0),u32(0),u32(0),u32(0x40000000)]);

/* The media timescale. 90000 is the usual choice because every sane frame
   rate divides it exactly, so no frame duration ever has to be rounded. */
const TIMESCALE=90000;

function buildMoov(o){
  const dur=o.sampleCount*o.delta;
  const mvhd=fullBox("mvhd",0,0,
    u32(0),u32(0),u32(TIMESCALE),u32(dur),
    u32(0x00010000),u16(0x0100),zeros(2),zeros(8),
    MATRIX,zeros(24),u32(2));

  const tkhd=fullBox("tkhd",0,3,
    u32(0),u32(0),u32(1),zeros(4),u32(dur),zeros(8),
    u16(0),u16(0),u16(0),zeros(2),
    MATRIX,u32(o.width<<16),u32(o.height<<16));

  const mdhd=fullBox("mdhd",0,0,u32(0),u32(0),u32(TIMESCALE),u32(dur),u16(0x55C4),u16(0));
  const hdlr=fullBox("hdlr",0,0,u32(0),str("vide"),zeros(12),str("VideoHandler\0"));

  const avcC=box("avcC",o.description);
  /* compressorname is a 32-byte Pascal string: one length byte, then padding. */
  const compressor=concat([bytes(0),zeros(31)]);
  const avc1=box("avc1",
    zeros(6),u16(1),
    u16(0),u16(0),zeros(12),
    u16(o.width),u16(o.height),
    u32(0x00480000),u32(0x00480000),zeros(4),
    u16(1),compressor,u16(0x0018),u16(0xFFFF),
    avcC);

  const stsd=fullBox("stsd",0,0,u32(1),avc1);
  /* Constant frame duration collapses the whole time-to-sample table to one
     entry — the reason this muxer can stay small. */
  const stts=fullBox("stts",0,0,u32(1),u32(o.sampleCount),u32(o.delta));
  const stss=fullBox("stss",0,0,u32(o.syncSamples.length),concat(o.syncSamples.map(u32)));
  const stsc=fullBox("stsc",0,0,u32(1),u32(1),u32(o.sampleCount),u32(1));
  const stsz=fullBox("stsz",0,0,u32(0),u32(o.sampleCount),concat(o.sizes.map(u32)));
  const stco=fullBox("stco",0,0,u32(1),u32(o.chunkOffset));

  const stbl=box("stbl",stsd,stts,stss,stsc,stsz,stco);
  const vmhd=fullBox("vmhd",0,1,u16(0),zeros(6));
  const dinf=box("dinf",fullBox("dref",0,0,u32(1),fullBox("url ",0,1)));
  const minf=box("minf",vmhd,dinf,stbl);
  const mdia=box("mdia",mdhd,hdlr,minf);
  const trak=box("trak",tkhd,mdia);
  return box("moov",mvhd,trak);
}

/* moov before mdat so a <video> can start without reading the whole blob.
   That makes stco circular — the sample offsets live inside the box whose
   size decides them — so build once to measure, then again for real. The
   second pass is exact: a u32 is a u32 whatever value it holds. */
function buildFile(o){
  const ftyp=box("ftyp",str("isom"),u32(0x200),str("isom"),str("iso2"),str("avc1"),str("mp41"));
  const probe=buildMoov(Object.assign({},o,{chunkOffset:0}));
  const offset=ftyp.length+probe.length+8;
  const moov=buildMoov(Object.assign({},o,{chunkOffset:offset}));
  const mdat=box("mdat",o.payload);
  return new Blob([ftyp,moov,mdat],{type:"video/mp4"});
}

/* ---------- encoders ---------- */

/* Baseline first, and not only for decoder reach: baseline has no B-frames,
   so encoder output order matches input order and a 4-second loop cannot
   come back re-ordered. Level 4.0 covers the keepsake's frame size. */
const CODECS=["avc1.42002a","avc1.42001f","avc1.4d002a","avc1.4d0028","avc1.640028"];

async function pickCodec(width,height,fps,bitrate){
  if(!global.VideoEncoder||!global.VideoEncoder.isConfigSupported)return null;
  for(const codec of CODECS){
    const config={codec,width,height,bitrate,framerate:fps,avc:{format:"avc"}};
    try{
      const support=await global.VideoEncoder.isConfigSupported(config);
      if(support&&support.supported)return config;
    }catch(e){}
  }
  return null;
}

/* A macrotask yield that browsers do not clamp. setTimeout(0) is floored at
   ~4ms and throttled to whole seconds whenever the page is not foreground,
   which turned a two-second encode into thirteen; MessageChannel is neither.
   The yield still has to be a macrotask, not a microtask, because that is
   what lets the encoder's output callbacks run and the queue drain. */
function nextTask(){
  return new Promise(resolve=>{
    const ch=new MessageChannel();
    ch.port1.onmessage=()=>{ch.port1.close();resolve();};
    ch.port2.postMessage(0);
  });
}

async function encodeWebCodecs(opts,config){
  const {width,height,fps,frameCount,renderFrame,onProgress}=opts;
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");

  const samples=[];
  let description=null,failure=null;
  const encoder=new global.VideoEncoder({
    output(chunk,meta){
      if(!description&&meta&&meta.decoderConfig&&meta.decoderConfig.description)
        description=new Uint8Array(meta.decoderConfig.description);
      const data=new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({data,timestamp:chunk.timestamp,key:chunk.type==="key"});
    },
    error(e){failure=e;}
  });
  encoder.configure(config);

  const micros=1e6/fps;
  for(let i=0;i<frameCount;i++){
    if(failure)throw failure;
    /* Checked every frame, not just at the end: a guest flicking between
       tabs would otherwise leave a stack of encoders running to completion,
       each fighting the others for the iPad. */
    if(opts.shouldAbort&&opts.shouldAbort()){encoder.close();throw new Error("aborted");}
    renderFrame(ctx,i);
    const frame=new global.VideoFrame(canvas,{timestamp:Math.round(i*micros),duration:Math.round(micros)});
    /* One keyframe. The clip is four seconds and always restarts from zero,
       so extra keyframes would only cost bytes. */
    encoder.encode(frame,{keyFrame:i===0});
    frame.close();
    if(onProgress)onProgress(i/frameCount*0.9);
    /* Let the encoder drain rather than queueing 100 frames of VRAM at once,
       and give the iPad's main thread a breath between them. */
    if(encoder.encodeQueueSize>6)await nextTask();
  }
  await encoder.flush();
  encoder.close();
  if(failure)throw failure;
  if(!samples.length||!description)throw new Error("no encoded output");

  samples.sort((a,b)=>a.timestamp-b.timestamp);
  const payload=concat(samples.map(s=>s.data));
  const syncSamples=[];
  samples.forEach((s,i)=>{if(s.key)syncSamples.push(i+1);});
  if(onProgress)onProgress(1);
  return buildFile({
    width,height,description,payload,
    sampleCount:samples.length,
    delta:Math.round(TIMESCALE/fps),
    sizes:samples.map(s=>s.data.length),
    syncSamples:syncSamples.length?syncSamples:[1]
  });
}

/* Real-time fallback. Frame timing is whatever the compositor gives us, so
   the loop seam is approximate — which is exactly why the timeline is
   authored to seam on a still frame rather than mid-transition. */
function recorderMime(){
  if(!global.MediaRecorder||!global.MediaRecorder.isTypeSupported)return null;
  const types=['video/mp4;codecs="avc1.42002a"','video/mp4;codecs=avc1','video/mp4'];
  for(const t of types)if(global.MediaRecorder.isTypeSupported(t))return t;
  return null;
}
function encodeRecorder(opts,mime){
  const {width,height,fps,frameCount,renderFrame,onProgress}=opts;
  return new Promise((resolve,reject)=>{
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d");
    renderFrame(ctx,0);
    const stream=canvas.captureStream(fps);
    let recorder;
    try{recorder=new global.MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:opts.bitrate});}
    catch(e){reject(e);return;}
    const parts=[];
    recorder.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data);};
    recorder.onstop=()=>{
      stream.getTracks().forEach(t=>t.stop());
      parts.length?resolve(new Blob(parts,{type:"video/mp4"})):reject(new Error("empty recording"));
    };
    recorder.onerror=e=>reject(e.error||new Error("recorder failed"));
    recorder.start();

    const started=performance.now(),span=frameCount/fps*1000;
    (function tick(){
      const elapsed=performance.now()-started;
      if(opts.shouldAbort&&opts.shouldAbort()){recorder.stop();return;}
      if(elapsed>=span){recorder.stop();return;}
      renderFrame(ctx,Math.min(frameCount-1,Math.floor(elapsed/1000*fps)));
      if(onProgress)onProgress(elapsed/span);
      requestAnimationFrame(tick);
    })();
  });
}

/* ---------- api ---------- */

function isSupported(){
  return !!(global.VideoEncoder&&global.VideoEncoder.isConfigSupported)||!!recorderMime();
}

/* opts: {width, height, fps, frameCount, renderFrame(ctx,i), bitrate?, onProgress?}
   Resolves to an MP4 Blob, or rejects if neither encoder is usable. */
async function encode(opts){
  const width=opts.width&1?opts.width-1:opts.width;
  const height=opts.height&1?opts.height-1:opts.height;
  const bitrate=opts.bitrate||Math.round(width*height*opts.fps*0.11);
  const job=Object.assign({},opts,{width,height,bitrate});

  const config=await pickCodec(width,height,opts.fps,bitrate);
  if(config){
    try{return await encodeWebCodecs(job,config);}
    catch(e){
      /* A real encoder failure falls through to the recorder rather than
         losing the keepsake; an abort means nobody wants this clip. */
      if(e&&e.message==="aborted")throw e;
    }
  }
  const mime=recorderMime();
  if(mime)return encodeRecorder(job,mime);
  throw new Error("no video encoder available");
}

global.MP4={encode,isSupported};

})(window);
