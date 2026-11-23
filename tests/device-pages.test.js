import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const origin = 'https://oralo.fun';
const store = 'https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605';

test('microphone and camera pages are paired, indexable, and limited to one device', () => {
  const config = JSON.parse(read('vercel.json'));
  const sitemap = read('public/sitemap.xml');
  for (const kind of ['microphone-test', 'camera-test']) {
    const other = kind === 'microphone-test' ? 'camera-test' : 'microphone-test';
    for (const lang of ['zh', 'en']) {
      const route = `/${lang}/tools/${kind}/`;
      const html = read(`public${route}index.html`);
      assert.equal((html.match(/<h1\b/g) || []).length, 1);
      assert.match(html, new RegExp(`<link rel="canonical" href="${origin}${route}">`));
      assert.doesNotMatch(html, /noindex|waitlist|type="email"|MediaRecorder|localStorage|innerHTML/);
      assert.match(html, new RegExp(`hreflang="zh-Hans" href="${origin}/zh/tools/${kind}/"`));
      assert.match(html, new RegExp(`hreflang="en" href="${origin}/en/tools/${kind}/"`));
      assert.match(html, new RegExp(`hreflang="x-default" href="${origin}/en/tools/${kind}/"`));
      assert.doesNotMatch(html, new RegExp(`hreflang="[^"]+" href="[^"]*/${other}/"`));
      assert.match(html, new RegExp(`href="/${lang}/tools/${other}/"`));
      assert.ok(html.includes(`href="${store}"`));
      assert.match(html, /<noscript>/);
      assert.match(html, /id="device-start"/);
      assert.match(html, /id="troubleshooting"/);
      assert.match(html, new RegExp(`href="/${lang}/#tools"`));
      assert.doesNotMatch(html, /macOS|Mac app|for Mac|适用于 Mac|通用购买/);
      assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]), ['/download.js', '/tools/device-tool.js']);
      const graph = JSON.parse(html.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      const crumbs = graph['@graph'].find(node => node['@type'] === 'BreadcrumbList');
      assert.equal(crumbs.itemListElement.length, 3);
      assert.equal(crumbs.itemListElement[1].item, `${origin}/${lang}/#tools`);
      assert.ok(existsSync(new URL(`../public/${lang}/index.html`, import.meta.url)));
      assert.match(read(`public/${lang}/index.html`), /id="tools"/);
      assert.match(sitemap, new RegExp(`<loc>${origin}${route}</loc><lastmod>2026-11-23</lastmod>`));
      assert.ok(graph['@graph'].every(node => !['FAQPage', 'HowTo', 'WebApplication', 'BlogPosting'].includes(node['@type'])));
      for (const [, reference] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const url = new URL(reference, origin + route);
        if (url.origin !== origin) continue;
        const file = `public${url.pathname}${url.pathname.endsWith('/') ? 'index.html' : ''}`;
        assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), reference);
        if (url.hash) assert.match(read(file), new RegExp(`id="${url.hash.slice(1)}"`), reference);
      }
    }
  }
  const microphone = config.headers.find(entry => entry.source === '/(zh|en)/tools/microphone-test(.*)');
  const camera = config.headers.find(entry => entry.source === '/(zh|en)/tools/camera-test(.*)');
  assert.equal(microphone.headers.find(header => header.key === 'Permissions-Policy').value, 'camera=(), microphone=(self), geolocation=()');
  assert.equal(camera.headers.find(header => header.key === 'Permissions-Policy').value, 'camera=(self), microphone=(), geolocation=()');
  for (const route of [microphone, camera]) {
    const policy = route.headers.find(header => header.key === 'Content-Security-Policy').value;
    assert.match(policy, /connect-src 'none'/);
    assert.match(policy, /form-action 'none'/);
    assert.ok(route.headers.some(header => header.key === 'Cache-Control' && header.value === 'no-store'));
  }
  const homeZh = read('public/zh/index.html');
  const homeEn = read('public/en/index.html');
  assert.match(homeZh, /href="\/zh\/tools\/microphone-test\/"/);
  assert.match(homeEn, /href="\/en\/tools\/camera-test\/"/);
  for (const lang of ['zh', 'en']) {
    for (const tool of ['speech-length', 'speech-preview']) {
      const html = read(`public/${lang}/tools/${tool}/index.html`);
      assert.match(html, new RegExp(`href="/${lang}/tools/microphone-test/"`));
      assert.match(html, new RegExp(`href="/${lang}/tools/camera-test/"`));
    }
  }
});

test('device runtime asks for one media kind only after an explicit start and releases it', () => {
  const adapter = read('public/tools/device-tool.js');
  const session = read('public/tools/device-session.js');
  assert.match(adapter, /source\.connect\(analyser\)/);
  assert.doesNotMatch(adapter, /destination|MediaRecorder|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|innerHTML|outerHTML|document\.write|eval\(/);
  assert.doesNotMatch(session, /MediaRecorder|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|innerHTML|outerHTML|document\.write|eval\(|\.destination/);
  assert.match(session, /audio: source, video: false/);
  assert.match(session, /audio: false, video: source/);
  assert.match(adapter, /addEventListener\('click', \(\) => session\.start\(\)\)/);
  assert.match(adapter, /visibilitychange/);
  assert.match(adapter, /pagehide/);
  assert.match(adapter, /pageshow/);
  assert.match(adapter, /devicechange/);
});
