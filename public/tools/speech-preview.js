import {SpeechPreviewController} from './speech-preview-core.js';

const copy=JSON.parse(document.getElementById('preview-copy').textContent);
const get=id=>document.getElementById(id);
const form=get('preview-form');
const script=get('preview-script');
const language=get('preview-language');
const voice=get('preview-voice');
const rate=get('preview-rate');
const pageLanguage=document.documentElement.lang.startsWith('zh')?'zh':'en';
const dialog=get('preview-language-dialog');
const format=(key,values)=>copy[key].replace(/\{(\w+)\}/g,(_,name)=>String(values[name]));
let optionsKey=null, lastAnnouncement=-1, languageTarget=null, languageTrigger=null;
function render(state) {
  const key=state.entries.map(entry=>entry.id).join('|');
  if (key!==optionsKey) {
    const options=[new Option(copy.voicePlaceholder,'')];
    for (const entry of state.entries) {
      let label=format('voiceOption',{name:entry.voice.name||copy.voiceUnnamed,lang:entry.voice.lang});
      if (entry.duplicate) label+=` · ${format('duplicateOption',{n:entry.ordinal})}`;
      options.push(new Option(label,entry.id));
    }
    voice.replaceChildren(...options); optionsKey=key;
  }
  voice.value=state.selectedId;
  voice.disabled=state.entries.length===0;
  get('reload-voices').disabled=!state.canReload;
  get('preview-play').disabled=!state.canPlay;
  get('preview-stop').disabled=!state.busy;
  get('preview-stop-dock').hidden=!state.busy;
  get('preview-voice-status').textContent=copy[state.voiceState==='ready'?'voicesReady':state.voiceState];
  const status=state.message==='playing' ? format('playing',{i:state.segment,n:state.total}) :
    state.message==='idle' && state.voiceState!=='ready' ? copy[state.voiceState] : copy[state.message];
  get('preview-status').textContent=status;
  get('preview-status').dataset.state=state.playState;
  get('preview-dock-status').textContent=status;
  if (lastAnnouncement!==state.announcementId) {
    get('preview-announcement').replaceChildren(document.createTextNode(copy[state.announcement]||''));
    lastAnnouncement=state.announcementId;
  }
}
let synth;
try { synth=window.speechSynthesis; } catch {}
const controller=new SpeechPreviewController({synth, Utterance:window.SpeechSynthesisUtterance,
  language:pageLanguage, isVisible:()=>document.visibilityState==='visible', onChange:render});
function clearErrors() {
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  for (const error of form.querySelectorAll('.tool-error')) { error.textContent=''; error.hidden=true; }
}
function updateMixedHelp() {
  get('preview-mixed-help').hidden=!(language.value==='zh' ? /\p{Script=Latin}/u.test(script.value) : /\p{Script=Han}/u.test(script.value));
}
function clearPage() {
  form.reset(); clearErrors(); get('preview-mixed-help').hidden=true;
  controller.reset(pageLanguage);
}
form.addEventListener('submit',event=>{
  event.preventDefault(); clearErrors();
  const result=controller.play({text:script.value,rate:Number(rate.value)});
  if (!result.errors) return;
  const fields={script:'preview-script',voice:'preview-voice',rate:'preview-rate'};
  let first;
  for (const [key,id] of Object.entries(fields)) {
    if (!result.errors[key]) continue;
    get(id).setAttribute('aria-invalid','true');
    const error=get(`${id}-error`); error.textContent=copy[result.errors[key]]; error.hidden=false;
    first??=get(id);
  }
  (first&&!first.disabled?first:get('preview-play')).focus();
});
script.addEventListener('input',()=>{clearErrors(); controller.edited(); updateMixedHelp();});
language.addEventListener('change',()=>{clearErrors(); controller.setLanguage(language.value); updateMixedHelp();});
voice.addEventListener('change',()=>{clearErrors(); controller.selectVoice(voice.value);});
rate.addEventListener('change',()=>{clearErrors(); controller.edited();});
get('reload-voices').addEventListener('click',()=>controller.reloadVoices());
for (const id of ['preview-stop','preview-dock-stop']) get(id).addEventListener('click',()=>controller.stop());
get('preview-clear').addEventListener('click',()=>{clearPage(); script.focus(); get('preview-announcement').textContent=copy.cleared;});
for (const link of document.querySelectorAll('[data-language-link]')) link.addEventListener('click',event=>{
  if (link.getAttribute('aria-current')==='page') { event.preventDefault(); return; }
  if (!script.value) return;
  event.preventDefault(); if(controller.snapshot().busy)controller.stop(); languageTarget=link.href; languageTrigger=link; dialog.showModal();
});
get('preview-stay').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{languageTarget=null; languageTrigger?.focus();});
get('preview-change').addEventListener('click',()=>{
  const destination=languageTarget; if (!destination) return;
  clearPage(); dialog.close(); window.location.assign(destination);
});
document.addEventListener('click',event=>{
  if (!event.defaultPrevented && event.target.closest('a[href]') && controller.snapshot().busy) controller.stop();
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')controller.hidden();});
window.addEventListener('pagehide',()=>{
  form.reset(); clearErrors(); get('preview-mixed-help').hidden=true;
  languageTarget=null; if(dialog.open)dialog.close(); controller.dispose();
});
window.addEventListener('pageshow',()=>{clearPage(); controller.mount();});
window.addEventListener('popstate',clearPage);
// Keep the stop control above the on-screen keyboard without capturing or transmitting viewport data.
function positionDock() {
  const viewport=window.visualViewport;
  const offset=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
  get('preview-stop-dock').style.setProperty('--keyboard-offset',`${offset}px`);
}
window.visualViewport?.addEventListener('resize',positionDock);
window.visualViewport?.addEventListener('scroll',positionDock);
clearPage(); controller.mount(); get('preview-controls').disabled=false; positionDock();
