import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');
const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('both tool pages expose complete localized text and working links without JavaScript', () => {
  for(const lang of ['zh','en']) {
    const route=`/${lang}/tools/speech-length/`, html=read(`public${route}index.html`), copy=JSON.parse(read(`src/content/speech-length-${lang}.json`));
    for(const field of ['pageTitle','pageDescription','heading','intro','privacy','methodBody','limitBody','ctaBody','noJs']) assert.ok(html.includes(escape(copy[field])), `${lang}: missing ${field}`);
    assert.equal((html.match(/<h1\b/g)||[]).length,1);
    assert.ok(html.includes(`<link rel="canonical" href="https://oralo.fun${route}">`));
    for(const [code,target] of [['zh-Hans','zh'],['en','en'],['x-default','en']]) assert.ok(html.includes(`hreflang="${code}" href="https://oralo.fun/${target}/tools/speech-length/"`));
    assert.ok(html.includes(`<html lang="${lang==='zh'?'zh-Hans':'en'}">`));
    assert.ok(html.includes(`property="og:locale" content="${lang==='zh'?'zh_CN':'en_US'}"`));
    assert.ok(html.includes('<fieldset id="calculator-controls" disabled>'));
    assert.ok(html.includes('<noscript>'));
    assert.equal((html.match(/<details>/g)||[]).length,6);
    assert.doesNotMatch(html,/\{\{|noindex|waitlist-form|type="email"/);
    for(const [question,answer] of copy.faqs) {assert.ok(html.includes(escape(question)));assert.ok(html.includes(escape(answer)));}
    for(const [,reference] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url=new URL(reference,'https://oralo.fun'+route);if(url.origin!=='https://oralo.fun')continue;
      const file=`public${url.pathname}${url.pathname.endsWith('/')?'index.html':''}`;
      assert.ok(existsSync(new URL(`../${file}`,import.meta.url)),reference);
      if(url.hash)assert.ok(read(file).includes(`id="${url.hash.slice(1)}"`),reference);
    }
    assert.ok(read(`public/${lang}/index.html`).includes(`href="${route}"`));
  }
});

test('tool routes load only the tool and download scripts and prohibit outbound connections and form submission', () => {
  for(const lang of ['zh','en']) {
    const html=read(`public/${lang}/tools/speech-length/index.html`);
    assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(x=>x[1]),['/download.js','/tools/speech-tool.js']);
    assert.doesNotMatch(html,/<script(?![^>]*(?:src=|type="application\/(?:ld\+)?json"))[^>]*>/);
    assert.ok(html.includes('autocomplete="off"'));
    assert.doesNotMatch(html,/maxlength=/);
  }
  const config=JSON.parse(read('vercel.json'));
  const route=config.headers.find(entry=>entry.source==='/(zh|en)/tools/speech-length(.*)');
  assert.ok(route);
  const policy=route.headers.find(header=>header.key==='Content-Security-Policy').value;
  assert.ok(policy.includes("connect-src 'none'"));assert.ok(policy.includes("form-action 'none'"));
  assert.ok(route.headers.some(header=>header.key==='Cache-Control'&&header.value==='no-store'));
  const runtime=read('public/tools/speech-tool.js')+read('public/tools/speech-math.js');
  assert.doesNotMatch(runtime,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|serviceWorker|console|clipboard)\b|innerHTML|outerHTML|document\.write|eval\(/);
});
