import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('preview has complete static bilingual content, reciprocal metadata and ordinary tool links',()=>{
 for(const lang of ['zh','en']) {
  const route=`/${lang}/tools/speech-preview/`,html=read(`public${route}index.html`),copy=JSON.parse(read(`src/content/speech-preview-${lang}.json`));
  for(const field of ['pageTitle','pageDescription','heading','intro','privacy','lifecycle','methodBody','limitBody','ctaBody','noJs','outputHelp','otherToolBody'])assert.ok(html.includes(escape(copy[field])),`${lang} ${field}`);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.equal((html.match(/<details>/g)||[]).length,7);
  assert.ok(html.includes(`rel="canonical" href="https://oralo.fun${route}"`));
  for(const [code,target] of [['en','en'],['zh-Hans','zh'],['x-default','en']])assert.ok(html.includes(`hreflang="${code}" href="https://oralo.fun/${target}/tools/speech-preview/"`));
  assert.ok(html.includes(`<html lang="${lang==='zh'?'zh-Hans':'en'}">`));
  assert.ok(html.includes('<fieldset id="preview-controls" disabled>'));assert.ok(html.includes('<noscript>'));
  assert.doesNotMatch(html,/\{\{|noindex|waitlist-form|type="email"|application\/ld\+json|maxlength=/);
  for(const [q,a] of copy.faqs){assert.ok(html.includes(escape(q)));assert.ok(html.includes(escape(a)));}
  for(const [,reference] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const url=new URL(reference,'https://oralo.fun'+route);if(url.origin!=='https://oralo.fun')continue;
   const file=`public${url.pathname}${url.pathname.endsWith('/')?'index.html':''}`;assert.ok(existsSync(new URL(`../${file}`,import.meta.url)),reference);
   if(url.hash)assert.ok(read(file).includes(`id="${url.hash.slice(1)}"`),reference);
  }
  for(const page of [`public/${lang}/index.html`,`public/${lang}/tools/speech-length/index.html`])assert.ok(read(page).includes(`href="${route}"`));
  assert.ok(html.includes(`href="/${lang}/tools/speech-length/"`));
  assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]),['/tools/speech-preview.js']);
  assert.doesNotMatch(html,/<script(?![^>]*(?:src=|type="application\/json"))[^>]*>/);
 }
});
test('preview security blocks connections and forms and exposes no storage, microphone, clipboard or analytics path',()=>{
 const config=JSON.parse(read('vercel.json')),route=config.headers.find(h=>h.source==='/(zh|en)/tools/speech-preview(.*)');
 assert.ok(route);const policy=route.headers.find(h=>h.key==='Content-Security-Policy').value;
 for(const rule of ["connect-src 'none'","form-action 'none'","object-src 'none'","base-uri 'none'"])assert.ok(policy.includes(rule));
 assert.ok(route.headers.some(h=>h.key==='Cache-Control'&&h.value==='no-store'));
 const runtime=read('public/tools/speech-preview.js')+read('public/tools/speech-preview-core.js');
 assert.doesNotMatch(runtime,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|serviceWorker|console|clipboard|getUserMedia|SpeechRecognition|webkitSpeechRecognition|MediaRecorder)\b|innerHTML|outerHTML|document\.write|eval\(/);
});
