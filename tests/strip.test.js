"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Strip = require("../strip.js");

function close(actual,expected,message){
  assert.ok(Math.abs(actual-expected)<1e-7,(message||"values must match")+": "+actual+" !== "+expected);
}

function mockContext(){
  var calls=[];
  var context={
    canvas:{width:0,height:0},
    calls:calls,
    save:function(){calls.push(["save"]);},
    restore:function(){calls.push(["restore"]);},
    setTransform:function(){calls.push(["setTransform"].concat(Array.from(arguments)));},
    clearRect:function(){calls.push(["clearRect"].concat(Array.from(arguments)));},
    fillRect:function(){calls.push(["fillRect"].concat(Array.from(arguments)));},
    strokeRect:function(){calls.push(["strokeRect"].concat(Array.from(arguments)));},
    beginPath:function(){calls.push(["beginPath"]);},
    rect:function(){calls.push(["rect"].concat(Array.from(arguments)));},
    clip:function(){calls.push(["clip"]);},
    translate:function(){calls.push(["translate"].concat(Array.from(arguments)));},
    rotate:function(){calls.push(["rotate"].concat(Array.from(arguments)));},
    drawImage:function(){calls.push(["drawImage"].concat(Array.from(arguments)));},
    strokeText:function(){calls.push(["strokeText"].concat(Array.from(arguments)));},
    fillText:function(){calls.push(["fillText"].concat(Array.from(arguments)));},
    measureText:function(text){
      var match=String(this.font||"").match(/([\d.]+)px/);
      var size=match?Number(match[1]):16;
      return {width:String(text||"").length*size*.55};
    },
    font:"16px sans-serif",
    fillStyle:"#000",
    strokeStyle:"#000",
    lineWidth:1,
    globalAlpha:1,
    textAlign:"left",
    textBaseline:"alphabetic"
  };
  return context;
}

test("locks one print geometry with three equal photo-dominant apertures",function(){
  var geometry=Strip.geometry();
  assert.equal(Strip.WIDTH,600);
  assert.equal(Strip.HEIGHT,1800);
  assert.equal(geometry.width,600);
  assert.equal(geometry.height,1800);
  assert.equal(geometry.outerBorder,18);
  assert.equal(geometry.photoGap,12);
  assert.equal(geometry.footerGap,12);
  assert.deepEqual(geometry.slots,[
    {x:18,y:18,w:564,h:504},
    {x:18,y:534,w:564,h:504},
    {x:18,y:1050,w:564,h:504}
  ]);
  assert.deepEqual(
    geometry.slots.map(function(slot){return [slot.w,slot.h];}),
    [[564,504],[564,504],[564,504]]
  );
  assert.equal(geometry.footer.y,1566);
  assert.equal(geometry.footer.h,216);
  assert.equal(geometry.footer.y+geometry.footer.h,geometry.height-geometry.outerBorder);
  assert.ok(geometry.slots.reduce(function(sum,slot){return sum+slot.h;},0)/geometry.height>.83);
});

test("keeps every footer and branding bound below the photographs and inside trim",function(){
  var geometry=Strip.geometry();
  var lastPhoto=geometry.slots[2];
  var footer=geometry.footer;
  assert.equal(footer.y-(lastPhoto.y+lastPhoto.h),12);
  [footer.event,footer.divider,footer.branding,footer.logoMax,footer.brandText].forEach(function(bound){
    assert.ok(bound.x>=footer.x);
    assert.ok(bound.y>=footer.y);
    assert.ok(bound.x+bound.w<=footer.x+footer.w);
    assert.ok(bound.y+bound.h<=footer.y+footer.h);
    assert.ok(bound.y>lastPhoto.y+lastPhoto.h);
  });
  assert.ok(footer.logoMax.x+footer.logoMax.w<footer.brandText.x);
});

test("returns fresh geometry and gives white, black, editorial and film identical slots",function(){
  var changed=Strip.geometry();
  changed.slots[0].x=999;
  assert.equal(Strip.geometry().slots[0].x,18);
  ["white","black","editorial","film"].forEach(function(style){
    var ctx=mockContext();
    var result=Strip.render(ctx,{frameStyle:style,images:[]});
    assert.deepEqual(result.geometry.slots,Strip.geometry().slots);
  });
});

test("cover-crops landscape and portrait sources without distortion",function(){
  var destination=Strip.geometry().slots[0];
  var landscape=Strip.coverCrop(1600,900,destination);
  var portrait=Strip.coverCrop(900,1600,destination);

  close(landscape.sw/landscape.sh,destination.w/destination.h,"landscape crop ratio");
  close(portrait.sw/portrait.sh,destination.w/destination.h,"portrait crop ratio");
  close(landscape.sh,900);
  close(landscape.sy,0);
  close(portrait.sw,900);
  close(portrait.sx,0);
  assert.ok(landscape.sx>0&&landscape.sx+landscape.sw<=1600);
  assert.ok(portrait.sy>0&&portrait.sy+portrait.sh<=1600);
  close(landscape.dw/landscape.sw,landscape.dh/landscape.sh,"landscape draw scale");
  close(portrait.dw/portrait.sw,portrait.dh/portrait.sh,"portrait draw scale");
});

test("honours focal points while clamping the crop to the source",function(){
  var destination=Strip.geometry().slots[0];
  var left=Strip.coverCrop(1600,900,destination,{x:0,y:0.5});
  var right=Strip.coverCrop(1600,900,destination,{x:1,y:0.5});
  close(left.sx,0);
  close(right.sx+right.sw,1600);
  close(left.sy,0);
  close(right.sy,0);
});

test("contains wide and tall logos inside the strict 96 by 32 maximum",function(){
  var max=Strip.geometry().footer.logoMax;
  var wide=Strip.containRect(800,200,max);
  var tall=Strip.containRect(100,400,max);
  assert.equal(wide.w,96);
  assert.equal(wide.h,24);
  assert.equal(wide.x,max.x);
  assert.equal(wide.y,max.y+4);
  assert.equal(tall.w,8);
  assert.equal(tall.h,32);
  assert.equal(tall.x,max.x+44);
  assert.equal(tall.y,max.y);
  [wide,tall].forEach(function(value){
    assert.ok(value.x>=max.x&&value.y>=max.y);
    assert.ok(value.x+value.w<=max.x+max.w);
    assert.ok(value.y+value.h<=max.y+max.h);
  });
});

test("lays out a business logo and label in separate controlled footer zones",function(){
  var geometry=Strip.geometry();
  var logo={naturalWidth:1200,naturalHeight:300};
  var layout=Strip.brandingLayout({logoImage:logo,brandName:"Bish Bash Events"},geometry);
  assert.equal(layout.label,"Bish Bash Events");
  assert.equal(layout.logoRect.w,96);
  assert.equal(layout.logoRect.h,24);
  assert.ok(layout.logoRect.x+layout.logoRect.w<layout.textBounds.x);
  assert.ok(layout.logoRect.y>=geometry.footer.y);
  assert.ok(layout.logoRect.y+layout.logoRect.h<=geometry.footer.y+geometry.footer.h);

  var logoOnly=Strip.brandingLayout({logoImage:logo},geometry);
  close(logoOnly.logoBounds.x+logoOnly.logoBounds.w/2,geometry.width/2);
  assert.equal(logoOnly.textBounds.w,0);
});

test("renders all photographs through canonical crops and grades only those apertures",function(){
  var ctx=mockContext();
  var images=[
    {width:1600,height:900},
    {width:900,height:1600},
    {width:1200,height:1200}
  ];
  var graded=[];
  var result=Strip.render(ctx,{
    images:images,
    frameStyle:"black",
    filterStyle:"mono",
    event:{name:"Laura & Harry",date:"19.05.2023"},
    branding:{logoImage:{width:800,height:200},brandName:"Summer Party 2026"},
    grade:function(details){graded.push(details);}
  });

  assert.equal(ctx.canvas.width,600);
  assert.equal(ctx.canvas.height,1800);
  assert.equal(result.crops.length,3);
  assert.equal(graded.length,3);
  graded.forEach(function(details,index){
    assert.equal(details.index,index);
    assert.deepEqual(details.destination,result.geometry.slots[index]);
    assert.equal(details.filterStyle,"mono");
  });

  var photoDraws=ctx.calls.filter(function(call){return call[0]==="drawImage"&&call.length===10;});
  var logoDraws=ctx.calls.filter(function(call){return call[0]==="drawImage"&&call.length===6;});
  assert.equal(photoDraws.length,3);
  assert.equal(logoDraws.length,1);
  assert.ok(logoDraws[0][4]<=96);
  assert.ok(logoDraws[0][5]<=32);
});

test("derives compact event footer copy without requiring browser globals",function(){
  assert.equal(typeof document,"undefined");
  assert.deepEqual(Strip.footerCopy({
    event:{name:"Sophie's Hen",location:"Ibiza",date:"16.05.27"}
  }),{
    primary:"Sophie's Hen",
    secondary:"Ibiza · 16.05.27",
    primaryStyle:"script"
  });
});

test("adds a subtle diagonal SAMPLE watermark to every draft photograph",function(){
  var ctx=mockContext();
  var images=[{width:1200,height:900},{width:1200,height:900},{width:1200,height:900}];
  var normal=Strip.render(mockContext(),{images:images,frameStyle:"white"});
  var draft=Strip.render(ctx,{images:images,frameStyle:"white",draft:true});

  assert.equal(Strip.DRAFT_LABEL,"SAMPLE");
  assert.equal(normal.draft.enabled,false);
  assert.equal(draft.draft.enabled,true);
  assert.equal(draft.draft.label,"SAMPLE");
  assert.equal(draft.draft.stamps.length,3);
  assert.equal(draft.draft.opacity,.18);
  close(draft.draft.angle,-Math.PI/6,"watermark angle");
  assert.deepEqual(draft.geometry.slots,normal.geometry.slots);

  draft.draft.stamps.forEach(function(stamp,index){
    var slot=draft.geometry.slots[index];
    assert.ok(stamp.x>=slot.x&&stamp.y>=slot.y);
    assert.ok(stamp.x+stamp.w<=slot.x+slot.w);
    assert.ok(stamp.y+stamp.h<=slot.y+slot.h);
    assert.ok(stamp.w<slot.w*.6,"sample watermark must remain controlled");
    assert.ok(stamp.h<slot.h*.2,"sample watermark must remain controlled");
  });
  assert.equal(draft.draft.outline,null,"the professional watermark has no frame or banner");
  assert.equal(ctx.calls.filter(function(call){return call[0]==="fillText"&&call[1]==="SAMPLE";}).length,3);
  assert.equal(ctx.calls.filter(function(call){return call[0]==="rotate"&&call[1]===-Math.PI/6;}).length,3);
});

test("paints the draft treatment last so photo and grade hooks cannot omit it",function(){
  ["white","black","editorial","film"].forEach(function(frameStyle){
    var ctx=mockContext();
    Strip.render(ctx,{
      images:[{width:900,height:900},{width:900,height:900},{width:900,height:900}],
      frameStyle:frameStyle,
      draft:{preview:true},
      drawPhoto:function(details){details.ctx.calls.push(["custom-photo",details.index]);},
      grade:function(details){details.ctx.calls.push(["custom-grade",details.index]);}
    });
    var lastHook=-1,firstMark=-1;
    ctx.calls.forEach(function(call,index){
      if(call[0]==="custom-photo"||call[0]==="custom-grade")lastHook=index;
      if(firstMark<0&&call[0]==="fillText"&&call[1]==="SAMPLE")firstMark=index;
    });
    assert.ok(firstMark>lastHook,frameStyle+" draft mark must be painted after every hook");
    assert.equal(ctx.calls.filter(function(call){return call[0]==="fillText"&&call[1]==="SAMPLE";}).length,3);
  });
});
