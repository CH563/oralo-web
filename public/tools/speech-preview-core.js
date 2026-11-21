export const PREVIEW_LIMIT = 5000;
export const SEGMENT_LIMIT = 300;
export const PREVIEW_RATES = [0.75, 1, 1.25, 1.5];

export function segmentScript(original, Segmenter = globalThis.Intl?.Segmenter) {
  let length = 0;
  for (const point of original) if (++length > PREVIEW_LIMIT) return {error:'tooLong'};
  if (!original.trim()) return {error:'empty'};
  if (/[<>]/.test(original)) return {error:'markup'};
  if (typeof Segmenter !== 'function') return {error:'unsupported'};
  const text = original.replace(/\r\n?/g, '\n');
  const normalizedPoints = Array.from(text);
  const clusters = [];
  let offset = 0;
  for (const {segment} of new Segmenter(undefined, {granularity:'grapheme'}).segment(text)) {
    const size = Array.from(segment).length;
    if (size > SEGMENT_LIMIT) return {error:'cluster'};
    clusters.push({text:segment, size, start:offset}); offset += size;
  }
  const segments = [];
  for (let start = 0; start < clusters.length;) {
    let end = start, size = 0;
    while (end < clusters.length && size + clusters[end].size <= SEGMENT_LIMIT) size += clusters[end++].size;
    let cut = end;
    if (end < clusters.length) {
      const candidates = {paragraph:0, sentence:0, space:0};
      let length = 0;
      for (let i = start; i < end; i++) {
        const cluster = clusters[i]; length += cluster.size;
        if (length < 150) continue;
        if (cluster.text.includes('\n')) candidates.paragraph = i + 1;
        else if (/[。！？!?；;]/u.test(cluster.text)) candidates.sentence = i + 1;
        else if (cluster.text === '.') {
          const before = normalizedPoints[cluster.start - 1] || '';
          const after = normalizedPoints[cluster.start + 1] || '';
          if (!(/\p{N}/u.test(before) && /\p{N}/u.test(after))) candidates.sentence = i + 1;
        } else if (/\s/u.test(cluster.text)) candidates.space = i + 1;
      }
      cut = candidates.paragraph || candidates.sentence || candidates.space || end;
    }
    segments.push(clusters.slice(start,cut).map(cluster=>cluster.text).join(''));
    start = cut;
  }
  return {segments};
}

export function voiceLanguage(tag) {
  if (typeof tag !== 'string' || !tag || tag !== tag.trim()) return null;
  try { Intl.getCanonicalLocales(tag); } catch { return null; }
  const primary = tag.split('-')[0].toLowerCase();
  return primary === 'zh' || primary === 'en' ? primary : null;
}
export function isLocalVoice(voice, language) {
  return !!voice && voice.localService === true && typeof voice.name === 'string' &&
    typeof voice.voiceURI === 'string' && voiceLanguage(voice.lang) === language;
}
const identity = voice => JSON.stringify([voice?.voiceURI, voice?.name, voice?.lang]);
const ERROR_CODES = {
  canceled:'interrupted', interrupted:'interrupted', 'not-allowed':'notAllowed',
  'voice-unavailable':'voiceInvalid', 'language-unavailable':'voiceInvalid', network:'networkError',
  'audio-busy':'audioError', 'audio-hardware':'audioError', 'text-too-long':'engineTooLong',
  'invalid-argument':'invalidArgument', 'synthesis-unavailable':'genericError', 'synthesis-failed':'genericError',
};

export class SpeechPreviewController {
  constructor({synth, Utterance, language='en', onChange=()=>{}, isVisible=()=>true, clock=globalThis, Segmenter=globalThis.Intl?.Segmenter}) {
    this.synth=synth; this.Utterance=Utterance; this.language=language;
    this.onChange=onChange; this.isVisible=isVisible; this.clock=clock; this.Segmenter=Segmenter;
    this.supported=!!synth && typeof Utterance==='function' && typeof Segmenter==='function' &&
      ['getVoices','speak','cancel','resume','addEventListener','removeEventListener'].every(key=>typeof synth[key]==='function');
    this.mounted=false; this.blocked=false; this.session=0; this.loadGeneration=0; this.listRevision=0;
    this.run=null; this.utterance=null; this.startTimer=null; this.endTimer=null; this.voiceTimer=null;
    this.raw=[]; this.rawSignatures=[]; this.entries=[]; this.selected=null;
    this.voiceState=this.supported?'loading':'unsupported'; this.playState='idle'; this.message='idle';
    this.announcement=''; this.announcementId=0;
    this.voicesChanged=()=>this.reloadVoices();
  }
  snapshot() {
    const busy=!!this.run;
    const selected=this.entries.find(entry=>entry.voice===this.selected?.voice);
    return {voiceState:this.voiceState, playState:this.playState, message:this.message, entries:this.entries,
      selectedId:selected?.id||'', language:this.language, busy,
      canPlay:this.supported&&!this.blocked&&!busy&&this.voiceState==='ready', canReload:this.supported,
      segment:this.run ? this.run.index+1 : 0, total:this.run?.segments.length||0,
      announcement:this.announcement, announcementId:this.announcementId};
  }
  emit(announcement) {
    if (announcement !== undefined) { this.announcement=announcement; this.announcementId++; }
    this.onChange(this.snapshot());
  }
  mount() {
    if (this.mounted) return;
    this.mounted=true;
    if (this.supported) {
      this.synth.addEventListener('voiceschanged',this.voicesChanged);
      this.reloadVoices();
    } else this.emit();
  }
  clearVoiceTimer() {
    this.loadGeneration++;
    if (this.voiceTimer!==null) this.clock.clearTimeout(this.voiceTimer);
    this.voiceTimer=null;
  }
  readList() {
    try { return Array.from(this.synth.getVoices()); } catch { return []; }
  }
  adoptList(list, force=false) {
    const signatures=list.map(voice=>[identity(voice),voice?.localService]);
    const unchanged=!force && list.length===this.raw.length && list.every((voice,i)=>
      voice===this.raw[i] && signatures[i][0]===this.rawSignatures[i]?.[0] && signatures[i][1]===this.rawSignatures[i]?.[1]);
    if (unchanged) return true;
    const previous=this.selected;
    this.raw=list; this.rawSignatures=signatures; this.listRevision++;
    const local=list.filter(voice=>isLocalVoice(voice,this.language));
    this.entries=local.map((voice,index)=>({id:`voice-${this.listRevision}-${index}`, voice, key:identity(voice),
      duplicate:local.filter(other=>other.name===voice.name).length>1, ordinal:index+1}));
    this.voiceState=list.length ? (this.entries.length?'ready':'noMatch') : 'loading';
    if (previous) {
      const matches=this.entries.filter(entry=>entry.key===previous.key);
      if (matches.length===1) this.selected={voice:matches[0].voice,key:matches[0].key};
      else {
        this.selected=null;
        this.fail('voiceInvalid');
        return false;
      }
    }
    this.emit();
    return true;
  }
  reloadVoices() {
    if (!this.mounted || !this.supported) return;
    this.clearVoiceTimer();
    this.adoptList(this.readList(),true);
    if (this.raw.length) return;
    const generation=this.loadGeneration;
    this.voiceTimer=this.clock.setTimeout(()=>{
      if (!this.mounted || generation!==this.loadGeneration) return;
      this.voiceTimer=null;
      this.adoptList(this.readList(),true);
      if (!this.raw.length) { this.voiceState='unready'; this.emit(); }
    },8000);
  }
  setLanguage(language) {
    this.edited(); this.selected=null; this.language=language;
    if (this.supported && this.mounted) this.reloadVoices();
    else this.emit();
  }
  selectVoice(id) {
    this.edited();
    const entry=this.entries.find(entry=>entry.id===id);
    this.selected=entry?{voice:entry.voice,key:entry.key}:null;
    this.emit();
  }
  verifyVoice() {
    if (!this.supported || !this.selected) return false;
    const hadSelection=!!this.selected;
    const valid=this.adoptList(this.readList());
    if (!valid || !this.selected) return false;
    const voice=this.selected.voice;
    if (!this.raw.includes(voice) || !isLocalVoice(voice,this.language) || identity(voice)!==this.selected.key) {
      this.selected=null;
      if (hadSelection) this.fail('voiceInvalid');
      return false;
    }
    return true;
  }
  clearPlaybackTimers() {
    for (const name of ['startTimer','endTimer']) {
      if (this[name]!==null) this.clock.clearTimeout(this[name]);
      this[name]=null;
    }
  }
  releaseUtterance() {
    if (this.utterance) this.utterance.onstart=this.utterance.onend=this.utterance.onerror=null;
    this.utterance=null;
  }
  cancelSession() {
    // Invalidate first: cancel may synchronously dispatch events from the old utterance.
    this.session++; this.run=null; this.clearPlaybackTimers(); this.releaseUtterance();
    if (this.supported) {
      try { this.synth.cancel(); } catch { this.blocked=true; return false; }
    }
    return true;
  }
  stop(reason='stopped') {
    const ok=this.cancelSession();
    this.playState=ok?'stopped':'error'; this.message=ok?reason:'stopFailure'; this.emit(this.message);
  }
  edited() {
    if (this.run) this.stop('edited');
    else if (this.playState==='error' && !this.blocked) { this.playState='idle'; this.message='idle'; this.emit(''); }
  }
  hidden() { if (this.run) this.stop('hidden'); }
  fail(reason) {
    const ok=this.cancelSession(); this.playState='error'; this.message=ok?reason:'stopFailure'; this.emit(this.message);
  }
  reset(language=this.language) {
    this.cancelSession(); this.selected=null; this.language=language;
    this.playState=this.blocked?'error':'idle'; this.message=this.blocked?'stopFailure':'idle';
    if (this.supported) {
      this.adoptList(this.raw,true);
      if (this.mounted && !this.raw.length) this.reloadVoices();
    } else this.voiceState='unsupported';
    this.emit('');
  }
  dispose() {
    this.mounted=false; this.clearVoiceTimer(); this.cancelSession();
    if (this.supported) this.synth.removeEventListener('voiceschanged',this.voicesChanged);
    this.selected=null; this.raw=[]; this.rawSignatures=[]; this.entries=[];
    this.playState='idle'; this.message='idle'; this.voiceState=this.supported?'loading':'unsupported'; this.emit('');
  }
  play({text,rate}) {
    if (this.run) return {ignored:true};
    const errors={};
    let prepared;
    try { prepared=segmentScript(text,this.Segmenter); } catch { prepared={error:'genericError'}; }
    if (prepared.error) errors.script=prepared.error;
    if (!this.supported) errors.voice='unsupported';
    else if (this.blocked) errors.voice='stopFailure';
    else if (!this.verifyVoice()) errors.voice=this.message==='voiceInvalid'?'voiceInvalid':'voiceRequired';
    if (!PREVIEW_RATES.includes(rate)) errors.rate='invalidRate';
    if (!this.isVisible()) errors.page='notVisible';
    if (Object.keys(errors).length) {
      this.playState='error'; this.message=Object.values(errors)[0]; this.emit(this.message); return {errors};
    }
    if (!this.cancelSession()) { this.fail('stopFailure'); return {errors:{voice:'stopFailure'}}; }
    try { if (this.synth.paused) this.synth.resume(); }
    catch { this.fail('genericError'); return {errors:{voice:'genericError'}}; }
    this.run={id:this.session, segments:prepared.segments.filter(segment=>segment.trim()), rate,
      voiceKey:this.selected.key, index:0, startedOnce:false, segmentStarted:false};
    this.playState='preparing'; this.message='preparing'; this.emit('preparing');
    this.submitSegment();
    return this.playState==='error' ? {errors:{voice:this.message}} : {ok:true};
  }
  current(id,index,utterance) {
    return this.mounted && this.run?.id===id && this.run.index===index && this.utterance===utterance;
  }
  submitSegment() {
    if (!this.run) return;
    if (!this.isVisible()) { this.stop('hidden'); return; }
    if (!this.verifyVoice() || !this.run) { if (this.run) this.fail('voiceInvalid'); return; }
    if (this.selected.key!==this.run.voiceKey) { this.fail('voiceInvalid'); return; }
    const {id,index,rate}=this.run;
    let utterance;
    try {
      utterance=new this.Utterance(this.run.segments[index]);
      utterance.voice=this.selected.voice; utterance.lang=this.selected.voice.lang;
      utterance.rate=rate; utterance.pitch=1; utterance.volume=1;
    } catch { this.fail('genericError'); return; }
    this.utterance=utterance; this.run.segmentStarted=false;
    this.playState='preparing'; this.message='preparing'; this.emit();
    utterance.onstart=()=>{
      if (!this.current(id,index,utterance) || this.run.segmentStarted) return;
      this.run.segmentStarted=true;
      if (this.startTimer!==null) this.clock.clearTimeout(this.startTimer); this.startTimer=null;
      this.playState='playing'; this.message='playing';
      const first=!this.run.startedOnce; this.run.startedOnce=true;
      this.endTimer=this.clock.setTimeout(()=>{if(this.current(id,index,utterance))this.fail('endTimeout');},180000);
      this.emit(first?'started':undefined);
    };
    utterance.onend=()=>{
      if (!this.current(id,index,utterance)) return;
      // Some engines end an unavailable voice without ever reporting a start.
      if (!this.run.segmentStarted) { this.fail('genericError'); return; }
      this.clearPlaybackTimers(); this.releaseUtterance();
      if (index+1===this.run.segments.length) {
        this.run=null; this.playState='finished'; this.message='finished'; this.emit('finished');
      } else { this.run.index++; this.submitSegment(); }
    };
    utterance.onerror=event=>{
      if (!this.current(id,index,utterance)) return;
      const code=Object.hasOwn(ERROR_CODES,event.error) ? ERROR_CODES[event.error] : 'genericError';
      this.fail(code);
      if (code==='voiceInvalid') { this.selected=null; this.reloadVoices(); }
    };
    this.startTimer=this.clock.setTimeout(()=>{
      if (this.current(id,index,utterance) && !this.run.segmentStarted) this.fail('startTimeout');
    },15000);
    try { this.synth.speak(utterance); } catch { this.fail('genericError'); }
  }
}
