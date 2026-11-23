import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readdirSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const origin = 'https://oralo.fun';

test('supplied article stays an unpublished draft with the recorded editorial fields', () => {
  for (const file of ['src/content/blog/five-minute-work-update.zh.md', 'src/content/blog/five-minute-work-update.en.md']) {
    const source = read(file);
    assert.match(source, /^status: draft$/m);
    assert.match(source, /^reviewStatus: pending-editorial-review$/m);
    assert.match(source, /^datePublished: null$/m);
    assert.match(source, /^dateModified: null$/m);
    assert.match(source, /^author: null$/m);
    assert.match(source, /^draftedAt: 2026-11-23$/m);
    assert.doesNotMatch(source, /^author: (?!null$)/m);
  }
});

test('draft blog previews are reachable and noindexed, linked in the shared menu, and absent from the public sitemap', () => {
  const sitemap = read('public/sitemap.xml');
  assert.doesNotMatch(sitemap, /\/blog\//);
  const config = JSON.parse(read('vercel.json'));
  const header = config.headers.find(entry => entry.source === '/(zh|en)/blog(.*)');
  assert.equal(header.headers.find(item => item.key === 'X-Robots-Tag').value, 'noindex, nofollow');
  const publicPages = [
    'public/zh/index.html', 'public/en/index.html',
    'public/zh/voice-following/index.html', 'public/en/voice-following/index.html',
    'public/zh/floating-prompt/index.html', 'public/en/floating-prompt/index.html',
    'public/zh/tools/speech-length/index.html', 'public/en/tools/speech-length/index.html',
    'public/zh/tools/speech-preview/index.html', 'public/en/tools/speech-preview/index.html',
    'public/zh/tools/microphone-test/index.html', 'public/en/tools/microphone-test/index.html',
    'public/zh/tools/camera-test/index.html', 'public/en/tools/camera-test/index.html'
  ];
  for (const page of publicPages) {
    const lang = page.includes('/en/') ? 'en' : 'zh';
    assert.match(read(page), new RegExp(`href="/${lang}/blog/"`), page);
    assert.doesNotMatch(read(page), /BlogPosting|datePublished/, page);
  }
  for (const lang of ['zh', 'en']) {
    for (const route of [`/${lang}/blog/`, `/${lang}/blog/five-minute-work-update/`]) {
      const html = read(`public${route}index.html`);
      assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
      assert.equal((html.match(/<h1\b/g) || []).length, 1);
      assert.match(html, new RegExp(`<link rel="canonical" href="${origin}${route}">`));
      assert.match(html, new RegExp(`hreflang="zh-Hans" href="${origin}/zh${route.slice(3)}"`));
      assert.match(html, new RegExp(`hreflang="en" href="${origin}/en${route.slice(3)}"`));
      assert.match(html, new RegExp(`hreflang="x-default" href="${origin}/en${route.slice(3)}"`));
      assert.doesNotMatch(html, /BlogPosting|datePublished|dateModified|"author"|Person/);
      assert.doesNotMatch(html, /<time\b/);
      assert.match(html, lang === 'zh' ? /编辑预览，尚未发布/ : /Editorial preview\. Not published/);
    }
    const article = read(`public/${lang}/blog/five-minute-work-update/index.html`);
    assert.match(article, /data-content-status="draft"/);
    assert.match(article, /data-review-status="pending-editorial-review"/);
    assert.match(article, /data-drafted-at="2026-11-23"/);
    assert.match(article, /900/);
    assert.match(article, /630/);
    assert.match(article, /140/);
    assert.match(article, lang === 'zh' ? /200 个汉字/ : /200 Chinese characters/);
    const visible = article.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    assert.equal((visible.match(/<h1\b/g) || []).length, 1);
    const graph = JSON.parse(article.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.ok(graph['@graph'].every(node => !['BlogPosting', 'Person', 'FAQPage'].includes(node['@type'])));
    assert.ok(graph['@graph'].every(node => node.datePublished == null && node.dateModified == null && node.author == null));
  }
  const names = readdirSync(new URL('../src/content/blog', import.meta.url));
  assert.deepEqual(names.filter(name => name.endsWith('.md')).sort(), ['five-minute-work-update.en.md', 'five-minute-work-update.zh.md']);
});
