import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readdirSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const origin = 'https://oralo.fun';

const publishedAt = '2026-11-23T18:06:07+08:00';
const publishedPattern = publishedAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the reviewed first article is published at the Shanghai release time without an author', () => {
  for (const file of ['src/content/blog/five-minute-work-update.zh.md', 'src/content/blog/five-minute-work-update.en.md']) {
    const source = read(file);
    assert.match(source, /^status: published$/m);
    assert.match(source, /^reviewStatus: approved$/m);
    assert.match(source, new RegExp(`^datePublished: ${publishedPattern}$`, 'm'));
    assert.match(source, /^dateModified: null$/m);
    assert.match(source, /^author: null$/m);
    assert.match(source, /^draftedAt: 2026-11-23$/m);
    assert.notEqual(publishedAt, '2026-11-23');
    assert.doesNotMatch(source, /^author: (?!null$)/m);
  }
});

test('the reviewed blog indexes and first article are public, and other blog URLs stay noindex', () => {
  const sitemap = read('public/sitemap.xml');
  const config = JSON.parse(read('vercel.json'));
  const robotHeaders = config.headers.filter(entry => entry.headers.some(item => item.key === 'X-Robots-Tag'));
  assert.deepEqual(robotHeaders.map(entry => entry.source), [
    '/:lang(zh|en)/blog/:slug((?!five-minute-work-update(?:/|$))[a-z0-9-]+)',
    '/:lang(zh|en)/blog/index.html',
    '/:lang(zh|en)/blog/:slug/:rest+'
  ]);
  assert.ok(robotHeaders.every(entry => entry.headers.find(item => item.key === 'X-Robots-Tag').value === 'noindex, nofollow'));
  const noindex = pathname => {
    if (/^\/(?:zh|en)\/blog\/index\.html$/.test(pathname)) return true;
    if (/^\/(?:zh|en)\/blog\/[^/]+\/.+/.test(pathname)) return true;
    const slug = pathname.match(/^\/(?:zh|en)\/blog\/([a-z0-9-]+)\/?$/);
    return Boolean(slug && slug[1] !== 'five-minute-work-update');
  };
  for (const pathname of ['/zh/blog/', '/en/blog/', '/zh/blog/five-minute-work-update/', '/en/blog/five-minute-work-update/']) assert.equal(noindex(pathname), false, pathname);
  for (const pathname of ['/zh/blog/future-draft/', '/en/blog/another-update/', '/zh/blog/index.html', '/en/blog/five-minute-work-update/index.html', '/zh/blog/five-minute-work-update/extra']) assert.equal(noindex(pathname), true, pathname);
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
      assert.doesNotMatch(html, /<meta name="robots" content="noindex, nofollow">/);
      assert.match(sitemap, new RegExp(`<loc>${origin}${route}</loc><lastmod>${publishedPattern}</lastmod>`));
      assert.equal((html.match(/<h1\b/g) || []).length, 1);
      assert.match(html, new RegExp(`<link rel="canonical" href="${origin}${route}">`));
      assert.match(html, new RegExp(`hreflang="zh-Hans" href="${origin}/zh${route.slice(3)}"`));
      assert.match(html, new RegExp(`hreflang="en" href="${origin}/en${route.slice(3)}"`));
      assert.match(html, new RegExp(`hreflang="x-default" href="${origin}/en${route.slice(3)}"`));
      assert.doesNotMatch(html, /编辑预览，尚未发布|Editorial preview\. Not published/);
      assert.doesNotMatch(html, /"author"|Person/);
    }
    const index = read(`public/${lang}/blog/index.html`);
    assert.match(index, /data-editorial-index="public"/);
    assert.match(index, new RegExp(`<time datetime="${publishedPattern}">${publishedPattern}</time>`));
    const article = read(`public/${lang}/blog/five-minute-work-update/index.html`);
    assert.match(article, /data-content-status="published"/);
    assert.match(article, /data-review-status="approved"/);
    assert.match(article, /data-drafted-at="2026-11-23"/);
    assert.match(article, new RegExp(`<time datetime="${publishedPattern}">${publishedPattern}</time>`));
    assert.doesNotMatch(article, /<time datetime="2026-11-23">/);
    assert.match(article, /900/);
    assert.match(article, /630/);
    assert.match(article, /140/);
    assert.match(article, lang === 'zh' ? /200 个汉字/ : /200 Chinese characters/);
    const visible = article.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    assert.equal((visible.match(/<h1\b/g) || []).length, 1);
    const graph = JSON.parse(article.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const posting = graph['@graph'].find(node => node['@type'] === 'BlogPosting');
    assert.ok(posting, lang);
    assert.equal(posting.datePublished, publishedAt);
    assert.equal(posting.dateModified, undefined);
    assert.equal(posting.author, undefined);
    assert.equal(posting.headline, lang === 'zh' ? '5 分钟工作汇报，怎样备稿和排练' : 'How to prepare and rehearse a five-minute work update');
    assert.ok(graph['@graph'].every(node => node['@type'] !== 'Person' && node.author == null));
    const indexGraph = JSON.parse(index.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.ok(indexGraph['@graph'].every(node => node['@type'] !== 'BlogPosting'));
  }
  const names = readdirSync(new URL('../src/content/blog', import.meta.url));
  assert.deepEqual(names.filter(name => name.endsWith('.md')).sort(), ['five-minute-work-update.en.md', 'five-minute-work-update.zh.md']);
});
