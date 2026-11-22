const language=document.documentElement.lang.startsWith('zh')?'zh':'en';let mode='follow';let resumed=false;let speaking=false;
const t=key=>translations[language][key]??translations.zh[key]??key;
function renderDemo(){
  const tele=document.querySelector('.teleprompter');tele.dataset.state=mode;
  document.querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));
  document.querySelector('#demo-status').textContent=t(resumed?'demoResumed':mode==='follow'?'demoFollow':mode==='pause'?'demoPause':'demoImprov');
  document.querySelector('#demo-line').innerHTML=t(resumed?'demoResumedLine':'demoLine');
  document.querySelector('#demo-next').textContent=t(resumed?'demoResumedNext':'demoLineNext');
  document.querySelector('#demo-caption').textContent=t(mode==='follow'?'demoCaptionFollow':mode==='pause'?'demoCaptionPause':'demoCaptionImprov');
  document.querySelector('#demo-recovery').hidden=mode!=='improv';
}
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;resumed=false;renderDemo()}));
document.querySelector('#resume-demo').addEventListener('click',()=>{mode='follow';resumed=true;renderDemo()});
renderDemo();
document.querySelector('#listen').addEventListener('click',()=>{
  const status=document.querySelector('#audio-status');if(!('speechSynthesis'in window)){status.textContent=t('audioUnavailable');return}
  if(speaking){speechSynthesis.cancel();speaking=false;return}const utterance=new SpeechSynthesisUtterance('roadmap');utterance.lang='en-US';utterance.rate=.85;
  const voice=speechSynthesis.getVoices().find(v=>v.lang==='en-US'&&v.localService)||speechSynthesis.getVoices().find(v=>v.lang==='en-US');if(voice)utterance.voice=voice;
  utterance.onstart=()=>{speaking=true;status.textContent=t('audioPlaying')};utterance.onend=()=>{speaking=false;status.textContent=t('audioDone')};utterance.onerror=()=>{speaking=false;status.textContent=t('audioUnavailable')};speechSynthesis.speak(utterance);
});
// Retire the former registration credential on this browser session.
try { sessionStorage.removeItem('oralo-receipt'); } catch {}
