import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const origin = 'https://oralo.fun';
const routes = ['zh', 'en'].flatMap(lang => [`/${lang}/`, `/${lang}/voice-following/`, `/${lang}/floating-prompt/`]);
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('all six pages contain localized content and reciprocal SEO metadata without JavaScript', () => {
  for (const route of routes) {
    const [, lang, slug] = route.split('/');
    const html = read(`public${route}index.html`);
    const copy = JSON.parse(read(`src/content/${lang}.json`));
    const guide = slug && JSON.parse(read('src/content/guides.json'))[slug][lang];
    const suffix = slug ? `${slug}/` : '';
    assert.match(html, new RegExp(`<html lang="${lang === 'zh' ? 'zh-Hans' : 'en'}">`));
    assert.ok(html.includes(`<title>${escape(guide ? guide.fields.title : copy.pageTitle)}</title>`));
    assert.ok(html.includes(`name="description" content="${escape(guide ? guide.fields.description : copy.pageDescription)}"`));
    assert.ok(html.includes(`<link rel="canonical" href="${origin}${route}">`));
    for (const [code, target] of [['zh-Hans','zh'],['en','en'],['x-default','en']]) {
      assert.ok(html.includes(`hreflang="${code}" href="${origin}/${target}/${suffix}"`), `${route} ${code}`);
    }
    assert.ok(html.includes(`property="og:locale" content="${lang === 'zh' ? 'zh_CN' : 'en_US'}"`));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.ok(html.includes(guide ? escape(guide.fields.H1) : copy.heroTitle));
    assert.ok(html.includes(escape(guide ? guide.paragraphs[0] : copy.heroDesc)));
    assert.equal((html.match(/<details>/g) || []).length, guide ? 3 : 7);
    assert.doesNotMatch(html, /\{\{|application\/ld\+json|googletagmanager|google-analytics|来源：|不要写成|You have confirmed/);
    for (const [, reference] of html.matchAll(/(?:href|src|poster)="([^"]+)"/g)) {
      const url = new URL(reference.replaceAll('&amp;', '&'), origin + route);
      if (url.origin !== origin) continue;
      const file = `public${url.pathname}${url.pathname.endsWith('/') ? 'index.html' : ''}`;
      assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${route}: missing ${reference}`);
      if (url.hash && file.endsWith('.html')) {
        assert.ok(read(file).includes(`id="${url.hash.slice(1)}"`), `${route}: broken anchor ${reference}`);
      }
    }
  }
});

test('localized homes retain both waitlist forms, all use cases and session withdrawal', () => {
  for (const lang of ['zh', 'en']) {
    const html = read(`public/${lang}/index.html`);
    assert.equal((html.match(/<form\b/g) || []).length, 2);
    for (const id of ['hero-email','footer-email','scenario','leave-waitlist','leave-status','mirror-video','privacy-dialog']) assert.ok(html.includes(`id="${id}"`));
    const select = html.match(/<select\b[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...select.matchAll(/<option value="([^"]*)"/g)].map(match => match[1]), ['', 'report', 'talk', 'meeting', 'other']);
    assert.equal((select.match(/<option\b/g) || []).length, (select.match(/<\/option>/g) || []).length);
    assert.ok(html.includes(`/privacy/?lang=${lang}`));
    assert.ok(html.includes(`/support/?lang=${lang}`));
  }
});

test('sitemap, robots and root redirects agree with the published language routes', () => {
  const sitemap = read('public/sitemap.xml');
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).sort(), [...routes, '/zh/tools/speech-length/', '/en/tools/speech-length/', '/privacy/', '/support/'].map(p => origin + p).sort());
  const robots = read('public/robots.txt');
  assert.match(robots, /Allow: \/\s/);
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  const { redirects } = JSON.parse(read('vercel.json'));
  assert.deepEqual(redirects, [
    { source: '/', has: [{type:'query', key:'lang', value:'en'}], destination:'/en/', statusCode:301 },
    { source: '/', destination:'/zh/', statusCode:301 }
  ]);
  assert.doesNotMatch(read('public/index.html'), /<h1\b|waitlist-form/);
});
