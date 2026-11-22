import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const source = read('public/download.js');
const url = JSON.parse(read('src/content/product.json')).appStoreUrl;
function harness(clipboard) {
  let click;
  const button = {hidden:true, disabled:false, dataset:{copied:'Copied',fallback:'Copy manually'}, addEventListener(event, handler) {assert.equal(event,'click'); click=handler;}};
  const link = {defaultValue:url, value:'Private script text must not be copied', focused:false, selected:false, focus(){this.focused=true;}, select(){this.selected=true;}};
  const status = {textContent:''};
  const elements = {'[data-copy-download]':button,'[data-download-link]':link,'[data-copy-status]':status};
  const panel = {querySelector(selector){assert.ok(selector in elements);return elements[selector];}};
  vm.runInNewContext(source, {document:{querySelectorAll(selector){assert.equal(selector,'[data-download]');return [panel];}}, navigator:{clipboard}});
  return {button,link,status,click:()=>click()};
}
test('download copy waits for a click, copies only the published URL and announces completion', async () => {
  const calls=[];
  const ui=harness({writeText:async text=>calls.push(text)});
  assert.deepEqual(calls,[]);
  assert.equal(ui.button.hidden,false);
  await ui.click();
  assert.deepEqual(calls,[url]);
  assert.equal(ui.status.textContent,'Copied');
  assert.equal(ui.link.value,'Private script text must not be copied');
  assert.equal(ui.button.disabled,false);
});
test('denied or unavailable clipboard offers focused manual selection and allows a retry', async () => {
  for(const clipboard of [undefined,{writeText:async()=>{throw new Error('NotAllowedError');}}]) {
    const ui=harness(clipboard);
    await ui.click();
    assert.equal(ui.status.textContent,'Copy manually');
    assert.equal(ui.link.focused,true);
    assert.equal(ui.link.selected,true);
    assert.equal(ui.button.disabled,false);
    await ui.click();
    assert.equal(ui.status.textContent,'Copy manually');
  }
});
test('download component has no clipboard-reading, script-input, storage or network path', () => {
  assert.doesNotMatch(source,/readText|navigator\.clipboard\.read\b|textarea|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|innerHTML|eval\(/);
});
test('localized samples and desktop transfer remain usable without JavaScript', () => {
  const samples=JSON.parse(read('src/content/guide-samples.json'));
  const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  for(const lang of ['en','zh']) {
    const txt=read(`public/samples/work-update-${lang}.txt`);
    assert.equal(txt,samples[lang].paragraphs.join('\n\n')+'\n');
    if(lang==='en') assert.doesNotMatch(txt,/\p{Script=Han}/u);
    for(const slug of ['', 'voice-following/', 'floating-prompt/', 'tools/speech-length/', 'tools/speech-preview/']) {
      const html=read(`public/${lang}/${slug}index.html`);
      assert.equal((html.match(/id="download-transfer"/g)||[]).length,1);
      assert.ok(html.includes(`value="${url}" readonly`));
      assert.ok(html.includes('src="/assets/app-store-qr.png"'));
      assert.match(html,/<button[^>]*data-copy-download[^>]* hidden>/);
      if(['voice-following/','floating-prompt/'].includes(slug)) {
        for(const paragraph of samples[lang].paragraphs)assert.ok(html.includes(escape(paragraph)));
        assert.ok(html.includes(`href="/samples/work-update-${lang}.txt" download=`));
        assert.equal((html.match(/class="guide-capture-source"/g)||[]).length,(html.match(/<figcaption>/g)||[]).length);
      }
    }
  }
});
