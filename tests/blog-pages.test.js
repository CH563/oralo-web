import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const origin = 'https://oralo.fun';

const publishedAt = '2026-11-23T18:06:07+08:00';
const secondPublishedAt = '2026-11-24T12:43:08+08:00';
const thirdPublishedAt = '2026-11-24T19:22:47+08:00';
const publishedPattern = publishedAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const secondPublishedPattern = secondPublishedAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const thirdPublishedPattern = thirdPublishedAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const publishedSlugs = ['five-minute-work-update', 'get-back-on-script', 'dingtalk-window-casting-teleprompter'];
const draftSlugHeader = '/:lang(zh|en)/blog/:slug((?!(?:five-minute-work-update|get-back-on-script|dingtalk-window-casting-teleprompter)(?:/|$))[a-z0-9-]+)';

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
    draftSlugHeader,
    '/:lang(zh|en)/blog/index.html',
    '/:lang(zh|en)/blog/:slug/:rest+'
  ]);
  assert.ok(robotHeaders.every(entry => entry.headers.find(item => item.key === 'X-Robots-Tag').value === 'noindex, nofollow'));
  const noindex = pathname => {
    if (/^\/(?:zh|en)\/blog\/index\.html$/.test(pathname)) return true;
    if (/^\/(?:zh|en)\/blog\/[^/]+\/.+/.test(pathname)) return true;
    const slug = pathname.match(/^\/(?:zh|en)\/blog\/([a-z0-9-]+)\/?$/);
    return Boolean(slug && !publishedSlugs.includes(slug[1]));
  };
  for (const pathname of ['/zh/blog/', '/en/blog/', ...publishedSlugs.flatMap(slug => [`/zh/blog/${slug}/`, `/en/blog/${slug}/`])]) assert.equal(noindex(pathname), false, pathname);
  for (const pathname of ['/zh/blog/future-draft/', '/en/blog/another-update/', '/zh/blog/index.html', '/en/blog/five-minute-work-update/index.html', '/zh/blog/get-back-on-script/index.html', '/zh/blog/five-minute-work-update/extra', '/en/blog/get-back-on-script/notes']) assert.equal(noindex(pathname), true, pathname);
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
    for (const route of [`/${lang}/blog/five-minute-work-update/`]) {
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
    for (const route of [`/${lang}/blog/`, `/${lang}/blog/get-back-on-script/`]) {
      const html = read(`public${route}index.html`);
      assert.doesNotMatch(html, /<meta name="robots" content="noindex, nofollow">/);
      const lastmod = route === '/zh/blog/' ? thirdPublishedPattern : secondPublishedPattern;
      assert.match(sitemap, new RegExp(`<loc>${origin}${route}</loc><lastmod>${lastmod}</lastmod>`));
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
  assert.deepEqual(names.filter(name => name.endsWith('.md')).sort(), [
    'dingtalk-window-casting-teleprompter.zh.md',
    'five-minute-work-update.en.md', 'five-minute-work-update.zh.md',
    'get-back-on-script.en.md', 'get-back-on-script.zh.md'
  ]);
  for (const file of ['src/content/blog/five-minute-work-update.zh.md', 'src/content/blog/five-minute-work-update.en.md']) {
    assert.doesNotMatch(read(file), /get-back-on-script/);
  }
});

test('the reviewed second article is published in both languages without draft metadata or internal notes', () => {
  const sitemap = read('public/sitemap.xml');
  const blogLocs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]).filter(url => url.includes('/blog/'));
  assert.deepEqual(blogLocs.sort(), [
    `${origin}/en/blog/`,
    `${origin}/en/blog/five-minute-work-update/`,
    `${origin}/en/blog/get-back-on-script/`,
    `${origin}/zh/blog/`,
    `${origin}/zh/blog/dingtalk-window-casting-teleprompter/`,
    `${origin}/zh/blog/five-minute-work-update/`,
    `${origin}/zh/blog/get-back-on-script/`
  ]);
  assert.doesNotMatch(sitemap, /future-draft|another-update|get-back-on-script\/[^<]/);
  const articles = {
    zh: {
      title: '离稿发挥之后，怎样接回下一句',
      seoTitle: '离稿发挥或忘词后，怎样接回下一句 · Oralo',
      excerpt: '离稿不一定是失误。先分清是有意补充还是位置丢失，再用入口句从下一件要说的事继续，而不是从头再念一遍。',
      opening: '现场汇报里，离开讲稿不一定是失误。',
      closing: '正式使用前，仍要在实际 App 里做一次短的排练。',
      fictional: '虚构的内部分享教学示例',
      limit: '它不保证能跳到任意较远的段落。',
      otherTitle: 'How to find your next line after you go off script',
      links: [
        'https://oralo.fun/zh/tools/speech-length/',
        'https://oralo.fun/zh/blog/five-minute-work-update/',
        'https://oralo.fun/zh/tools/speech-preview/',
        'https://oralo.fun/zh/voice-following/',
        'https://oralo.fun/zh/tools/microphone-test/',
        'https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605'
      ]
    },
    en: {
      title: 'How to find your next line after you go off script',
      seoTitle: 'How to Get Back on Script After You Go Off Track · Oralo',
      excerpt: 'Going off script is often useful. The skill is returning to the next point without restarting from the beginning.',
      opening: 'Leaving your script mid-update is often the useful part.',
      closing: 'Rehearse once in the app you will actually use.',
      fictional: 'fictional teaching example',
      limit: 'A jump to a distant paragraph is not guaranteed.',
      otherTitle: '离稿发挥之后，怎样接回下一句',
      links: [
        'https://oralo.fun/en/tools/speech-length/',
        'https://oralo.fun/en/blog/five-minute-work-update/',
        'https://oralo.fun/en/tools/speech-preview/',
        'https://oralo.fun/en/voice-following/',
        'https://oralo.fun/en/tools/microphone-test/',
        'https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605'
      ]
    }
  };
  for (const file of ['src/content/blog/get-back-on-script.zh.md', 'src/content/blog/get-back-on-script.en.md']) {
    const source = read(file);
    assert.match(source, /^status: published$/m);
    assert.match(source, /^reviewStatus: approved$/m);
    assert.match(source, new RegExp(`^datePublished: ${secondPublishedPattern}$`, 'm'));
    assert.match(source, /^dateModified: null$/m);
    assert.match(source, /^author: null$/m);
    assert.match(source, /^draftedAt: 2026-11-24$/m);
    assert.doesNotMatch(source, /^author: (?!null$)/m);
    assert.doesNotMatch(source, /内部交付说明|内部编辑说明|Toastmasters|pending-editorial-review|已测试成功/);
  }
  for (const lang of ['zh', 'en']) {
    const copy = articles[lang];
    const route = `/${lang}/blog/get-back-on-script/`;
    const html = read(`public${route}index.html`);
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    const article = visible.match(/<article class="blog-article">([\s\S]*?)<\/article>/)[1];
    assert.equal((visible.match(/<h1\b/g) || []).length, 1);
    assert.match(visible, new RegExp(`<title>${copy.seoTitle}</title>`));
    assert.match(visible, new RegExp(`<h1>${copy.title}</h1>`));
    assert.match(article, new RegExp(copy.excerpt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(article.includes(copy.opening));
    assert.ok(article.includes(copy.closing));
    assert.ok(article.includes(copy.fictional));
    assert.ok(article.includes(copy.limit));
    assert.doesNotMatch(article, new RegExp(copy.otherTitle));
    assert.doesNotMatch(article, /macOS|Mac 测试|Not verified|guaranteed device/);
    assert.match(article, lang === 'zh' ? /iPhone 与 iPad/ : /iPhone and iPad/);
    for (const link of copy.links) assert.match(article, new RegExp(`href="${link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.doesNotMatch(visible, /内部交付说明|内部编辑说明|Toastmasters|contentId|reviewStatus|datePublished:|dateModified|heroImage|pending-editorial|已测试成功|status: draft|author:|seoTitle:|excerpt:|```|:\s*null\b|\bnull\b/);
    assert.doesNotMatch(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(html, /data-content-status="published"/);
    assert.match(html, /data-review-status="approved"/);
    assert.match(html, /data-drafted-at="2026-11-24"/);
    assert.match(html, new RegExp(`<time datetime="${secondPublishedPattern}">${secondPublishedPattern}</time>`));
    assert.doesNotMatch(html, /<time datetime="2026-11-24">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${origin}${route}">`));
    assert.match(html, new RegExp(`hreflang="zh-Hans" href="${origin}/zh/blog/get-back-on-script/"`));
    assert.match(html, new RegExp(`hreflang="en" href="${origin}/en/blog/get-back-on-script/"`));
    assert.match(html, new RegExp(`hreflang="x-default" href="${origin}/en/blog/get-back-on-script/"`));
    assert.match(html, new RegExp(`href="/zh/blog/get-back-on-script/"[^>]*data-language-link="zh"`));
    assert.match(html, new RegExp(`href="/en/blog/get-back-on-script/"[^>]*data-language-link="en"`));
    const graph = JSON.parse(html.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const posting = graph['@graph'].find(node => node['@type'] === 'BlogPosting');
    assert.equal(posting.headline, copy.title);
    assert.equal(posting.datePublished, secondPublishedAt);
    assert.equal(posting.dateModified, undefined);
    assert.equal(posting.author, undefined);
    assert.equal(posting.url, `${origin}${route}`);
    assert.ok(graph['@graph'].every(node => node['@type'] !== 'Person' && node.author == null));
    const index = read(`public/${lang}/blog/index.html`);
    const cards = [...index.matchAll(/<article class="blog-card">([\s\S]*?)<\/article>/g)].map(match => match[1]);
    assert.equal(cards.length, lang === 'zh' ? 3 : 2);
    assert.match(cards[0], new RegExp(`href="/${lang}/blog/five-minute-work-update/"`));
    assert.match(cards[0], new RegExp(`<time datetime="${publishedPattern}">`));
    assert.match(cards[1], new RegExp(`href="/${lang}/blog/get-back-on-script/"`));
    assert.ok(cards[1].includes(copy.title));
    assert.match(cards[1], new RegExp(copy.excerpt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(cards[1], new RegExp(`<time datetime="${secondPublishedPattern}">${secondPublishedPattern}</time>`));
    assert.doesNotMatch(index, new RegExp(copy.otherTitle));
    assert.doesNotMatch(index, /blog-draft-banner|noindex, nofollow|内部交付|:\s*null\b/);
    assert.match(index, new RegExp(`<link rel="canonical" href="${origin}/${lang}/blog/">`));
    assert.match(index, new RegExp(`hreflang="zh-Hans" href="${origin}/zh/blog/"`));
    assert.match(index, new RegExp(`hreflang="en" href="${origin}/en/blog/"`));
    assert.match(index, new RegExp(`hreflang="x-default" href="${origin}/en/blog/"`));
  }
});

test('the approved DingTalk article is Chinese only, published, and keeps both safe images', () => {
  const slug = 'dingtalk-window-casting-teleprompter';
  const route = `/zh/blog/${slug}/`;
  const source = read(`src/content/blog/${slug}.zh.md`);
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, '');
  assert.equal(createHash('sha256').update(body).digest('hex'), 'bc8f5df13c757946f1812d321d2259c30305e97f1cd4afcc6fb530bfbe66996d');
  assert.match(source, /^status: published$/m);
  assert.match(source, /^reviewStatus: approved$/m);
  assert.match(source, new RegExp(`^datePublished: ${thirdPublishedPattern}$`, 'm'));
  assert.match(source, /^dateModified: null$/m);
  assert.match(source, /^draftedAt: null$/m);
  assert.match(source, /^author: null$/m);
  assert.doesNotMatch(source, /^author: (?!null$)/m);
  assert.doesNotMatch(source, /translationUrl|\/en\/blog\/dingtalk|hreflang: en/);
  assert.equal(existsSync(new URL(`../src/content/blog/${slug}.en.md`, import.meta.url)), false);
  assert.equal(existsSync(new URL(`../public/en/blog/${slug}/index.html`, import.meta.url)), false);
  for (const sentence of [
    '如果共享的是整个桌面，或做了屏幕镜像，提词窗可能一起出现在对方画面里。',
    '把背景调透明，只改变自己阅读时的观感，并不会自动把提词从共享画面中藏掉。',
    '这一点不能推广成「所有投屏、录屏或会议软件都会自动排除提词窗」。',
    '换了一种投屏方法，或改用系统镜像、整屏录制时，都要重新看预览，不能只靠上次的经验。',
    '应选「应用窗口」，然后选择要分享的 PPT 或浏览器，再开始投屏。',
    'https://oralo.fun/zh/#macos'
  ]) assert.ok(body.includes(sentence), sentence);
  const images = {
    'dingtalk-window-casting-redacted.jpg': ['29427a331b750b5a01b23bf057d677706dc35d422f517d56ff52dc3e350a5723', '外接大屏只显示汇报演示，Mac 上保留 Oralo 提词窗口。照片中的投屏连接信息已遮盖。', 1280, 1707],
    'dingtalk-window-guide.png': ['fbb94101f89b8d197d2f748b82542ab236d21c93c131cf5c70b484a4fcf24901', 'Oralo 使用指南「视频会议与投屏」中的钉钉投屏示例，应选择「应用窗口」。', 685, 1039]
  };
  const html = read(`public${route}index.html`);
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  assert.equal((visible.match(/<h1\b/g) || []).length, 1);
  assert.match(visible, /<title>钉钉投屏时，怎样让观众看汇报、自己看提词 · Oralo<\/title>/);
  assert.match(visible, /<h1>钉钉投屏时，怎样让观众看汇报、自己看提词<\/h1>/);
  assert.match(html, /data-content-status="published"/);
  assert.match(html, /data-review-status="approved"/);
  assert.doesNotMatch(html, /<meta name="robots" content="noindex, nofollow">|blog-draft-banner|编辑预览，尚未发布/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${origin}${route}">`));
  assert.deepEqual([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(match => [match[1], match[2]]), [
    ['zh-Hans', `${origin}${route}`],
    ['x-default', `${origin}${route}`]
  ]);
  assert.doesNotMatch(html, /hreflang="en"|og:locale:alternate|\/en\/blog\/dingtalk-window-casting-teleprompter/);
  assert.match(html, /property="og:locale" content="zh_CN"/);
  assert.match(html, /href="\/en\/blog\/" lang="en" data-language-fallback="blog-index" title="这篇只有中文" aria-label="这篇只有中文，前往英文指南列表" data-language-link="en"/);
  assert.match(html, new RegExp(`<time datetime="${thirdPublishedPattern}">${thirdPublishedPattern}</time>`));
  assert.doesNotMatch(html, /<time datetime="2026-11-24">|"author"|Person/);
  for (const [name, [checksum, alt, width, height]] of Object.entries(images)) {
    const file = `public${route}${name}`;
    const bytes = readFileSync(new URL(`../${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum, name);
    assert.match(html, new RegExp(`<img src="${route}${name}" alt="${alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" width="${width}" height="${height}" loading="lazy" decoding="async">`));
  }
  assert.match(html, /class="blog-figure"/);
  const graph = JSON.parse(html.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const posting = graph['@graph'].find(node => node['@type'] === 'BlogPosting');
  assert.equal(posting.headline, '钉钉投屏时，怎样让观众看汇报、自己看提词');
  assert.equal(posting.datePublished, thirdPublishedAt);
  assert.equal(posting.inLanguage, 'zh-Hans');
  assert.equal(posting.author, undefined);
  assert.equal(posting.url, `${origin}${route}`);
  const zhIndex = read('public/zh/blog/index.html');
  const enIndex = read('public/en/blog/index.html');
  const zhCards = [...zhIndex.matchAll(/<article class="blog-card">([\s\S]*?)<\/article>/g)].map(match => match[1]);
  assert.equal(zhCards.length, 3);
  assert.match(zhCards[2], new RegExp(`href="${route}"`));
  assert.match(zhCards[2], /钉钉投屏时，怎样让观众看汇报、自己看提词/);
  assert.match(zhCards[2], new RegExp(`<time datetime="${thirdPublishedPattern}">`));
  assert.doesNotMatch(enIndex, /dingtalk-window-casting-teleprompter|钉钉投屏时/);
  assert.match(read('public/sitemap.xml'), new RegExp(`<loc>${origin}${route}</loc><lastmod>${thirdPublishedPattern}</lastmod>`));
  assert.doesNotMatch(read('public/sitemap.xml'), /\/en\/blog\/dingtalk-window-casting-teleprompter/);
  assert.match(read('src/content/product.json'), /https:\/\/github\.com\/CH563\/oralo\/releases\/tag\/macos-v0\.1\.0-beta\.12/);
  assert.match(read('public/zh/index.html'), /https:\/\/github\.com\/CH563\/oralo\/releases\/tag\/macos-v0\.1\.0-beta\.12/);
  assert.match(read('public/en/index.html'), /https:\/\/github\.com\/CH563\/oralo\/releases\/tag\/macos-v0\.1\.0-beta\.12/);
});
