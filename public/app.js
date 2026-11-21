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
const dialog=document.querySelector('#privacy-dialog');let privacyTrigger;
document.querySelectorAll('.privacy-open').forEach(button=>button.addEventListener('click',()=>{privacyTrigger=button;dialog.showModal()}));
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});dialog.addEventListener('close',()=>privacyTrigger?.focus());
document.querySelector('#listen').addEventListener('click',()=>{
  const status=document.querySelector('#audio-status');if(!('speechSynthesis'in window)){status.textContent=t('audioUnavailable');return}
  if(speaking){speechSynthesis.cancel();speaking=false;return}const utterance=new SpeechSynthesisUtterance('roadmap');utterance.lang='en-US';utterance.rate=.85;
  const voice=speechSynthesis.getVoices().find(v=>v.lang==='en-US'&&v.localService)||speechSynthesis.getVoices().find(v=>v.lang==='en-US');if(voice)utterance.voice=voice;
  utterance.onstart=()=>{speaking=true;status.textContent=t('audioPlaying')};utterance.onend=()=>{speaking=false;status.textContent=t('audioDone')};utterance.onerror=()=>{speaking=false;status.textContent=t('audioUnavailable')};speechSynthesis.speak(utterance);
});
let receipt;try{receipt=JSON.parse(sessionStorage.getItem('oralo-receipt'))}catch{}
const leaveButton=document.querySelector('#leave-waitlist');leaveButton.hidden=!receipt;
function message(form,key,error=false){const el=form.querySelector('.form-status');el.dataset.message=key;el.textContent=t(key);el.classList.toggle('error',error)}
for(const form of document.querySelectorAll('.waitlist-form'))form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('[type=submit]');if(button.disabled)return;
  const email=form.elements.email.value.trim();button.disabled=true;message(form,'submitting');
  try{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);let response;
    try{response=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,company:form.elements.company.value,scenario:form.elements.scenario?.value||'',language,consent:true}),signal:controller.signal})}finally{clearTimeout(timer)}
    const result=await response.json();if(!response.ok){message(form,response.status===429?'rate':response.status===400?'invalid':'error',true);return}
    if(result.ok!==true)throw new Error('not_saved');message(form,'success');
    if(result.withdrawalToken){receipt={email,token:result.withdrawalToken};try{sessionStorage.setItem('oralo-receipt',JSON.stringify(receipt))}catch{}leaveButton.hidden=false}
    form.reset();
  }catch{message(form,'error',true)}finally{button.disabled=false}
});
leaveButton.addEventListener('click',async()=>{
  if(!receipt)return;leaveButton.disabled=true;const status=document.querySelector('#leave-status');
  try{const response=await fetch('/api/waitlist',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(receipt)});if(!response.ok)throw new Error('failed');receipt=null;try{sessionStorage.removeItem('oralo-receipt')}catch{}leaveButton.hidden=true;status.textContent=t('removed');document.querySelectorAll('.form-status').forEach(el=>{el.textContent='';delete el.dataset.message})}catch{status.textContent=t('removeError')}finally{leaveButton.disabled=false}
});
