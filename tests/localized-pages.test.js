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
    assert.doesNotMatch(html, /\{\{|googletagmanager|google-analytics|来源：|不要写成|You have confirmed/);
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

test('published pages link to the App Store and contain no registration forms or prerelease copy', () => {
  const store='https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605';
  const allRoutes=[...routes,...['zh','en'].flatMap(lang=>[`/${lang}/tools/speech-length/`,`/${lang}/tools/speech-preview/`]),'/privacy/','/support/'];
  for(const route of allRoutes){
    const html=read(`public${route}index.html`);
    assert.doesNotMatch(html,/waitlist|候补|开发版|开发测试|尚未公开|in development|development app|testing opens|not publicly released|type="email"/i);
    if(route!=='/privacy/')assert.ok(html.includes(`href="${store}"`),route);
    if(route==='/en/'||route==='/zh/'){
      assert.equal((html.match(/<form\b/g)||[]).length,0);
      assert.ok(html.includes('id="download"'));assert.ok(html.includes('id="mirror-video"'));
      assert.equal((html.match(/class="button download-link"/g)||[]).length,1);
      assert.ok(html.includes('class="app-store-badge download-link"'));
      assert.ok(html.includes('class="source-link" href="https://github.com/CH563/oralo"'));
      assert.ok(html.includes('src="/assets/github-mark.svg"'));
      assert.equal((html.match(/src="\/assets\/app-store-badge.svg"/g)||[]).length,1);
    }
  }
  const runtime=read('public/app.js');
  assert.doesNotMatch(runtime,/fetch\(|XMLHttpRequest|sendBeacon|sessionStorage\.setItem/);
});

test('sitemap, robots and root redirects agree with the published language routes', () => {
  const sitemap = read('public/sitemap.xml');
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).sort(), [...routes, '/zh/tools/speech-length/', '/en/tools/speech-length/', '/zh/tools/speech-preview/', '/en/tools/speech-preview/', '/privacy/', '/support/'].map(p => origin + p).sort());
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

test('English native screenshots and video use separate English assets on every page', () => {
  const manifest=JSON.parse(read('src/content/english-screenshots.json'));
  const english=routes.filter(route=>route.startsWith('/en/')).map(route=>read(`public${route}index.html`)).join('\n');
  const chinese=routes.filter(route=>route.startsWith('/zh/')).map(route=>read(`public${route}index.html`)).join('\n');
  const imageRefs=html=>[...html.matchAll(/\/assets\/app-(?:library|prepare|review|reader-controls|reader|pick-up|pronunciation|readiness|floating-controls|ipad|floating)(?:-(?:en|zh))?-\d+\.webp/g)].map(match=>match[0]);
  assert.ok(imageRefs(english).length>0);
  assert.ok(imageRefs(english).every(ref=>/-en-\d+\.webp$/.test(ref)));
  assert.ok(imageRefs(chinese).every(ref=>!/-en-\d+\.webp$/.test(ref)));
  for(const [name,{widths}] of Object.entries(manifest.screenshots)){
    for(const width of widths){
      const asset=`/assets/app-${name}-en-${width}.webp`;
      assert.ok(english.includes(asset),`unused English capture: ${asset}`);
      assert.ok(existsSync(new URL(`../public${asset}`,import.meta.url)),asset);
    }
  }
  assert.ok(english.includes('poster="/assets/mirror-poster-en.webp"'));
  assert.ok(english.includes('data-source="/assets/oralo-mirror-demo-en.mp4"'));
  assert.ok(chinese.includes('data-source="/assets/oralo-mirror-demo.mp4"'));
  assert.doesNotMatch(english,/134 words|checks in Chinese/);
});

test('Chinese guides use current native captures of the shared sample and show recovery controls', () => {
  const manifest=JSON.parse(read('src/content/chinese-screenshots.json'));
  const guides=JSON.parse(read('src/content/guides.json'));
  const samples=JSON.parse(read('src/content/guide-samples.json'));
  const html=['voice-following','floating-prompt'].map(slug=>read(`public/zh/${slug}/index.html`)).join('\n');
  assert.equal(read(`public${manifest.sample}`),samples.zh.paragraphs.join('\n\n')+'\n');
  const imageRefs=[...html.matchAll(/\/assets\/app-[\w-]+-\d+\.webp/g)].map(m=>m[0]);
  assert.ok(imageRefs.length>0&&imageRefs.every(ref=>/-zh-\d+\.webp$/.test(ref)));
  for(const [asset,{widths}] of Object.entries(manifest.screenshots)){
    for(const width of widths){
      const reference=`/assets/app-${asset}-zh-${width}.webp`;
      assert.ok(html.includes(reference),reference);
      assert.ok(existsSync(new URL(`../public${reference}`,import.meta.url)),reference);
    }
  }
  for(const slug of ['voice-following','floating-prompt']){
    for(const section of guides[slug].zh.guide.sections.filter(s=>s.image)){
      assert.ok(section.image.source.includes(manifest.appVersion.replace(' (','（').replace(')','）')));
      assert.ok(manifest.screenshots[section.image.asset]);
    }
  }
  assert.ok(html.includes('app-reader-controls-zh-640.webp'));
  assert.ok(html.includes('app-pick-up-zh-640.webp'));
  assert.ok(html.includes('id="pick-up"'));
  assert.doesNotMatch(html,/与这份练习稿不同|New script（新建讲稿）|图中从排练入口进入/);
});
