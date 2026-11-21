import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentScript, voiceLanguage, isLocalVoice, SpeechPreviewController} from '../public/tools/speech-preview-core.js';

const voice=(extra={})=>({name:'Test voice',lang:'en-US',voiceURI:'test:en',localService:true,...extra});
class Clock {
  now=0; serial=0; timers=new Map();
  setTimeout(fn,delay) {const id=++this.serial;this.timers.set(id,{fn,at:this.now+delay});return id;}
  clearTimeout(id) {this.timers.delete(id);}
  tick(ms) {const target=this.now+ms;for(;;){const next=[...this.timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>target)break;this.now=next[1].at;this.timers.delete(next[0]);next[1].fn();}this.now=target;}
}
class Synth {
  constructor(voices) {this.voices=voices;this.calls=[];this.spoken=[];this.listeners=new Set();this.paused=false;}
  addEventListener(type,fn){assert.equal(type,'voiceschanged');this.calls.push('listen');this.listeners.add(fn);}
  removeEventListener(type,fn){this.listeners.delete(fn);}
  getVoices(){this.calls.push('getVoices');return this.voices;}
  speak(u){this.calls.push('speak');this.spoken.push(u);if(this.throwSpeak)throw Error('private raw engine error');}
  cancel(){this.calls.push('cancel');this.onCancel?.();if(this.throwCancel)throw Error('private cancel error');}
  resume(){this.calls.push('resume');this.paused=false;}
  changed(){for(const fn of this.listeners)fn();}
}
class Utterance {constructor(text){this.text=text;}}
function setup(voices=[voice()],opts={}) {
  const synth=new Synth(voices),clock=new Clock(),announcements=[];let announcementId=-1,visible=true;
  const c=new SpeechPreviewController({synth,Utterance,clock,isVisible:()=>visible,onChange:s=>{if(s.announcementId!==announcementId){announcements.push(s.announcement);announcementId=s.announcementId;}},...opts});
  c.mount();return {synth,clock,c,announcements,hide:()=>{visible=false;c.hidden();},show:()=>{visible=true;}};
}
const choose=({c},index=0)=>c.selectVoice(c.entries[index].id);
const play=(ctx,text='A public test sentence.',rate=1)=>ctx.c.play({text,rate});
const callbacks=u=>({start:u.onstart,end:u.onend,error:u.onerror});

test('preview segmentation preserves normalized Unicode text, clusters, and the scalar limit',()=>{
  for(const input of ['汉'.repeat(5000),'🙂'.repeat(5000),'a'.repeat(1200),('cafe\u0301 👨‍👩‍👧‍👦 🇨🇳\r\n').repeat(100)]) {
    const {segments,error}=segmentScript(input);assert.equal(error,undefined);
    assert.equal(segments.join(''),input.replace(/\r\n?/g,'\n'));assert.ok(segments.every(s=>Array.from(s).length<=300));
    const boundaries=new Set([0,...[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(input.replace(/\r\n?/g,'\n'))].map(s=>s.index+s.segment.length)]);
    let offset=0;for(const part of segments){offset+=part.length;assert.ok(boundaries.has(offset));}
  }
  for(const input of ['🙂'.repeat(5001),'a'.repeat(4999)+'\r\n'])assert.equal(segmentScript(input).error,'tooLong');
  assert.equal(segmentScript('a'+'\u0301'.repeat(300)).error,'cluster');
  assert.equal(segmentScript(' \n\t').error,'empty');
  for(const input of ['<speak>Hi</speak>','1 > 0','<audio src="https://invalid.test">'])assert.equal(segmentScript(input).error,'markup');
  assert.equal(segmentScript('你好 2026, café 3.5% AI 🙂').error,undefined);
  assert.equal(segmentScript('Hi',null).error,'unsupported');
});

test('preview boundaries prefer paragraphs, punctuation, whitespace, then whole graphemes',()=>{
  const paragraph='a'.repeat(160)+'\n'+'b'.repeat(60)+'.'+'c'.repeat(30)+' '+'d'.repeat(100);
  assert.equal(segmentScript(paragraph).segments[0].length,161);
  const punctuation='a'.repeat(160)+'!'+'b'.repeat(60)+';'+'c'.repeat(30)+' '+'d'.repeat(100);
  assert.equal(segmentScript(punctuation).segments[0].length,222);
  assert.equal(segmentScript('a'.repeat(180)+' '+'b'.repeat(200)).segments[0].length,181);
  assert.equal(segmentScript('a'.repeat(180)+'3.5'+'b'.repeat(200)).segments[0].length,300);
  assert.equal(segmentScript('a'.repeat(180)+'.'+'b'.repeat(200)).segments[0].length,181);
  assert.equal(segmentScript('a'.repeat(299)+'👨‍👩‍👧‍👦'+'b'.repeat(301)).segments[0].length,299);
});

test('only strictly local voices with valid zh/en tags are eligible, regardless of names/default flags',()=>{
  for(const tag of ['en-US','EN-us','en-GB','zh','zh-Hant-TW','zh-Hans-CN'])assert.equal(voiceLanguage(tag),tag.split('-')[0].toLowerCase());
  for(const tag of ['',undefined,'en_US',' en-US','en-US ','fr-FR','i-invalid','en-'])assert.equal(voiceLanguage(tag),null);
  for(const flag of [false,undefined,null,1,'true'])assert.equal(isLocalVoice(voice({localService:flag}),'en'),false);
  const ctx=setup([voice({default:true,localService:false}),voice({lang:'zh-CN'}),voice({lang:'en_US'}),voice(),null]);
  assert.equal(ctx.c.entries.length,1);assert.equal(ctx.c.selected,null);assert.equal(ctx.synth.spoken.length,0);
  assert.equal(play(ctx).errors.voice,'voiceRequired');assert.equal(ctx.synth.spoken.length,0);
});

test('empty voice list waits once, accepts late events, and ignores obsolete load timers',()=>{
  const ctx=setup([]);assert.deepEqual(ctx.synth.calls,['listen','getVoices']);assert.equal(ctx.c.voiceState,'loading');
  const stale=[...ctx.clock.timers.values()][0].fn;ctx.clock.tick(7999);assert.equal(ctx.synth.calls.length,2);
  ctx.clock.tick(1);assert.equal(ctx.c.voiceState,'unready');assert.equal(ctx.synth.calls.filter(x=>x==='getVoices').length,2);
  ctx.clock.tick(30000);assert.equal(ctx.synth.calls.filter(x=>x==='getVoices').length,2);
  ctx.c.reloadVoices();assert.equal(ctx.c.voiceState,'loading');
  ctx.synth.voices=[voice()];ctx.synth.changed();stale();ctx.clock.tick(10000);
  assert.equal(ctx.c.voiceState,'ready');assert.equal(ctx.c.selected,null);assert.equal(ctx.synth.spoken.length,0);
  ctx.c.setLanguage('zh');assert.equal(ctx.c.voiceState,'noMatch');assert.equal(ctx.c.snapshot().canPlay,false);
});

test('unique voice identity uses the latest object; a changed, missing or remote voice stops playback',()=>{
  for(const replacement of [[],[voice({localService:false})],[voice({lang:'zh-CN'})],[voice({name:'Another'})]]) {
    const ctx=setup();choose(ctx);play(ctx,'a'.repeat(700));const old=callbacks(ctx.synth.spoken[0]);ctx.synth.voices=replacement;ctx.synth.changed();
    assert.equal(ctx.c.message,'voiceInvalid');assert.equal(ctx.c.selected,null);assert.equal(ctx.c.run,null);
    old.start();old.end();old.error({error:'canceled'});assert.equal(ctx.synth.spoken.length,1);
  }
  const ctx=setup();choose(ctx);play(ctx,'a'.repeat(700));const latest=voice();ctx.synth.voices=[latest,voice({voiceURI:'test:another'})];ctx.synth.changed();
  assert.equal(ctx.c.selected.voice,latest);assert.equal(ctx.synth.spoken.length,1);ctx.synth.spoken[0].onstart();ctx.synth.spoken[0].onend();assert.equal(ctx.synth.spoken[1].voice,latest);
  ctx.synth.voices=[voice({localService:false})];ctx.synth.spoken[1].onstart();ctx.synth.spoken[1].onend();assert.equal(ctx.c.message,'voiceInvalid');assert.equal(ctx.synth.spoken.length,2);
});

test('ambiguous voices require explicit choice and are cleared after any list rebuild',()=>{
  const ctx=setup([voice(),voice(),voice({lang:'en-GB',voiceURI:'test:gb'})]);
  assert.ok(ctx.c.entries.every(e=>e.duplicate));assert.equal(new Set(ctx.c.entries.map(e=>e.id)).size,3);
  choose(ctx,1);assert.equal(play(ctx).ok,true);assert.equal(ctx.synth.spoken[0].voice,ctx.synth.voices[1]);
  ctx.synth.changed();assert.equal(ctx.c.selected,null);assert.equal(ctx.c.message,'voiceInvalid');assert.equal(ctx.c.run,null);
});

test('mutating a selected voice without an event is detected before playback',()=>{
  const ctx=setup();choose(ctx);ctx.synth.voices[0].localService=false;
  assert.equal(play(ctx).errors.voice,'voiceInvalid');assert.equal(ctx.synth.spoken.length,0);
});

test('first speak is synchronous with explicit settings; only one segment is queued at a time',()=>{
  const ctx=setup();choose(ctx);const script='a'.repeat(701);
  for(const rate of [0.75,1,1.25,1.5]) {
    ctx.synth.paused=true;const before=ctx.synth.spoken.length;assert.equal(play(ctx,script,rate).ok,true);assert.equal(ctx.synth.spoken.length,before+1);
    assert.deepEqual(ctx.synth.calls.slice(-4),['cancel','resume','getVoices','speak']);
    assert.equal(play(ctx,script,rate).ignored,true);assert.equal(ctx.synth.spoken.length,before+1);
    let u=ctx.synth.spoken.at(-1);assert.equal(u.rate,rate);assert.equal(u.voice,ctx.synth.voices[0]);assert.equal(u.lang,'en-US');assert.equal(u.pitch,1);assert.equal(u.volume,1);
    const joined=[];while(ctx.c.run){u=ctx.synth.spoken.at(-1);joined.push(u.text);u.onstart();u.onend();}
    assert.equal(joined.join(''),script);assert.equal(ctx.c.playState,'finished');
  }
  assert.equal(ctx.announcements.filter(x=>x==='started').length,4);assert.equal(ctx.announcements.filter(x=>x==='preparing').length,4);
});

test('old events and timers cannot affect a rapidly restarted session or queue another segment',()=>{
  const ctx=setup();choose(ctx);play(ctx,'a'.repeat(900));const old=callbacks(ctx.synth.spoken[0]),oldTimer=[...ctx.clock.timers.values()][0].fn;
  ctx.synth.onCancel=()=>old.error({error:'interrupted'});ctx.c.stop();assert.equal(ctx.c.message,'stopped');
  play(ctx);old.start();old.end();old.error({error:'canceled'});oldTimer();assert.equal(ctx.c.playState,'preparing');assert.equal(ctx.synth.spoken.length,2);
  const current=callbacks(ctx.synth.spoken[1]);current.start();current.start();assert.equal(ctx.clock.timers.size,1);current.end();current.end();
  assert.equal(ctx.c.playState,'finished');assert.equal(ctx.synth.spoken.length,2);
});

test('editing, voice/language changes, hiding, reset and disposal cancel with no automatic restart',()=>{
  for(const action of ['edit','voice','language','hide','reset','dispose']) {
    const ctx=setup();choose(ctx);play(ctx,'a'.repeat(1000));const old=callbacks(ctx.synth.spoken[0]);
    if(action==='edit')ctx.c.edited();if(action==='voice')ctx.c.selectVoice('');if(action==='language')ctx.c.setLanguage('zh');
    if(action==='hide')ctx.hide();if(action==='reset')ctx.c.reset();if(action==='dispose')ctx.c.dispose();
    assert.equal(ctx.c.run,null);assert.equal(ctx.c.utterance,null);assert.equal(ctx.c.startTimer,null);assert.equal(ctx.c.endTimer,null);
    ctx.show();old.start();old.end();old.error({error:'canceled'});ctx.clock.tick(300000);assert.equal(ctx.synth.spoken.length,1);
    if(action==='dispose'){assert.equal(ctx.synth.listeners.size,0);ctx.c.mount();assert.equal(ctx.synth.listeners.size,1);assert.equal(ctx.c.selected,null);}
  }
});

test('watchdogs cancel at 15 seconds without start or 180 seconds after start, with no retry',()=>{
  for(const started of [false,true]) {
    const ctx=setup();choose(ctx);play(ctx,'a'.repeat(900));const old=callbacks(ctx.synth.spoken[0]);if(started)old.start();
    const timeout=started?180000:15000;ctx.clock.tick(timeout-1);assert.ok(ctx.c.run);ctx.clock.tick(1);
    assert.equal(ctx.c.message,started?'endTimeout':'startTimeout');assert.equal(ctx.c.run,null);old.end();ctx.clock.tick(300000);assert.equal(ctx.synth.spoken.length,1);
  }
});

test('all engine errors use fixed messages and never select a fallback or retry',()=>{
  const codes={canceled:'interrupted',interrupted:'interrupted','not-allowed':'notAllowed','voice-unavailable':'voiceInvalid','language-unavailable':'voiceInvalid',network:'networkError','audio-busy':'audioError','audio-hardware':'audioError','text-too-long':'engineTooLong','invalid-argument':'invalidArgument','synthesis-unavailable':'genericError','synthesis-failed':'genericError',unknown:'genericError',['__proto__']:'genericError'};
  for(const [error,message] of Object.entries(codes)) {
    const ctx=setup();choose(ctx);play(ctx);ctx.synth.spoken[0].onerror({error,message:'Never render the raw event'});
    assert.equal(ctx.c.message,message);assert.equal(ctx.c.run,null);ctx.clock.tick(300000);assert.equal(ctx.synth.spoken.length,1);
    if(message==='voiceInvalid')assert.equal(ctx.c.selected,null);
  }
  const ctx=setup();choose(ctx);ctx.synth.throwSpeak=true;play(ctx);assert.equal(ctx.c.message,'genericError');assert.equal(ctx.c.run,null);
});

test('invalid input and unsupported APIs never call speak; cancellation failure disables further playback',()=>{
  const ctx=setup();choose(ctx);
  for(const [text,rate,key] of [['',1,'empty'],['x'.repeat(5001),1,'tooLong'],['<speak>x</speak>',1,'markup'],['x',2,'invalidRate']]){
    assert.ok(Object.values(play(ctx,text,rate).errors).includes(key));assert.equal(ctx.synth.spoken.length,0);
  }
  ctx.hide();assert.equal(play(ctx).errors.page,'notVisible');ctx.show();
  ctx.synth.throwCancel=true;play(ctx);assert.equal(ctx.c.snapshot().canPlay,false);assert.equal(ctx.c.message,'stopFailure');assert.equal(ctx.synth.spoken.length,0);
  const missing=setup([],{synth:null});assert.equal(missing.c.voiceState,'unsupported');assert.equal(play(missing).errors.voice,'unsupported');
});

test('an engine ending before start is an error, never a successful preview',()=>{
 const ctx=setup();choose(ctx);play(ctx);ctx.synth.spoken[0].onend();
 assert.equal(ctx.c.playState,'error');assert.equal(ctx.c.message,'genericError');assert.equal(ctx.c.run,null);
 assert.ok(!ctx.announcements.includes('finished'));
});
