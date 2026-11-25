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
const slidesPublishedAt = '2026-11-25T10:42:42+08:00';
const slidesPublishedPattern = slidesPublishedAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const publishedSlugs = ['five-minute-work-update', 'get-back-on-script', 'dingtalk-window-casting-teleprompter', 'from-slides-to-script'];
const draftSlugHeader = '/:lang(zh|en)/blog/:slug((?!(?:five-minute-work-update|get-back-on-script|dingtalk-window-casting-teleprompter|from-slides-to-script)(?:/|$))[a-z0-9-]+)';

const visibleTime = {
  zh: {
    [publishedAt]: '2026年11月23日 18:06',
    [secondPublishedAt]: '2026年11月24日 12:43',
    [thirdPublishedAt]: '2026年11月24日 19:22',
    [slidesPublishedAt]: '2026年11月25日 10:42'
  },
  en: {
    [publishedAt]: 'Nov 23, 2026, 18:06',
    [secondPublishedAt]: 'Nov 24, 2026, 12:43',
    [thirdPublishedAt]: 'Nov 24, 2026, 19:22',
    [slidesPublishedAt]: 'Nov 25, 2026, 10:42'
  }
};
const publisher = {
  '@type': 'Person',
  name: 'LiWen Chen',
  url: 'https://x.com/LiWen563',
  image: 'https://oralo.fun/assets/liwen-chen.jpg',
  sameAs: ['https://x.com/LiWen563', 'https://github.com/CH563']
};
const timeTag = (iso, lang) => `<time datetime="${iso}">${visibleTime[lang][iso]}</time>`;

test('the reviewed first article keeps its Shanghai publication instant', () => {
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
      assert.ok(html.includes(timeTag(publishedAt, lang)));
    }
    for (const route of [`/${lang}/blog/`, `/${lang}/blog/get-back-on-script/`]) {
      const html = read(`public${route}index.html`);
      assert.doesNotMatch(html, /<meta name="robots" content="noindex, nofollow">/);
      const lastmod = route.endsWith('/blog/') ? slidesPublishedPattern : secondPublishedPattern;
      assert.match(sitemap, new RegExp(`<loc>${origin}${route}</loc><lastmod>${lastmod}</lastmod>`));
      assert.equal((html.match(/<h1\b/g) || []).length, 1);
      assert.match(html, new RegExp(`<link rel="canonical" href="${origin}${route}">`));
      assert.match(html, new RegExp(`hreflang="zh-Hans" href="${origin}/zh${route.slice(3)}"`));
      assert.match(html, new RegExp(`hreflang="en" href="${origin}/en${route.slice(3)}"`));
      assert.match(html, new RegExp(`hreflang="x-default" href="${origin}/en${route.slice(3)}"`));
      assert.doesNotMatch(html, /编辑预览，尚未发布|Editorial preview\. Not published/);
      if (route.endsWith('/blog/')) assert.doesNotMatch(html, /"author"|Person|blog-byline/);
    }
    const index = read(`public/${lang}/blog/index.html`);
    assert.match(index, /data-editorial-index="public"/);
    assert.ok(index.includes(timeTag(publishedAt, lang)));
    const article = read(`public/${lang}/blog/five-minute-work-update/index.html`);
    assert.match(article, /data-content-status="published"/);
    assert.match(article, /data-review-status="approved"/);
    assert.match(article, /data-drafted-at="2026-11-23"/);
    assert.ok(article.includes(timeTag(publishedAt, lang)));
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
    assert.deepEqual(posting.author, publisher);
    assert.equal(posting.headline, lang === 'zh' ? '5 分钟工作汇报，怎样备稿和排练' : 'How to prepare and rehearse a five-minute work update');
    assert.ok(graph['@graph'].every(node => node['@type'] !== 'Person'));
    assert.ok(graph['@graph'].filter(node => node !== posting).every(node => node.author == null));
    const indexGraph = JSON.parse(index.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.ok(indexGraph['@graph'].every(node => node['@type'] !== 'BlogPosting'));
  }
  const names = readdirSync(new URL('../src/content/blog', import.meta.url));
  assert.deepEqual(names.filter(name => name.endsWith('.md')).sort(), [
    'dingtalk-window-casting-teleprompter.zh.md',
    'five-minute-work-update.en.md', 'five-minute-work-update.zh.md',
    'from-slides-to-script.en.md', 'from-slides-to-script.zh.md',
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
    `${origin}/en/blog/from-slides-to-script/`,
    `${origin}/en/blog/get-back-on-script/`,
    `${origin}/zh/blog/`,
    `${origin}/zh/blog/dingtalk-window-casting-teleprompter/`,
    `${origin}/zh/blog/five-minute-work-update/`,
    `${origin}/zh/blog/from-slides-to-script/`,
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
    assert.ok(html.includes(timeTag(secondPublishedAt, lang)));
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
    assert.deepEqual(posting.author, publisher);
    assert.equal(posting.url, `${origin}${route}`);
    assert.ok(graph['@graph'].every(node => node['@type'] !== 'Person'));
    const index = read(`public/${lang}/blog/index.html`);
    const cards = [...index.matchAll(/<article class="blog-card">([\s\S]*?)<\/article>/g)].map(match => match[1]);
    assert.equal(cards.length, lang === 'zh' ? 4 : 3);
    assert.match(cards[0], new RegExp(`href="/${lang}/blog/five-minute-work-update/"`));
    assert.match(cards[0], new RegExp(`<time datetime="${publishedPattern}">`));
    assert.match(cards[1], new RegExp(`href="/${lang}/blog/get-back-on-script/"`));
    assert.ok(cards[1].includes(copy.title));
    assert.match(cards[1], new RegExp(copy.excerpt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(cards[1].includes(timeTag(secondPublishedAt, lang)));
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
  assert.ok(html.includes(timeTag(thirdPublishedAt, 'zh')));
  assert.doesNotMatch(html, /<time datetime="2026-11-24">/);
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
  assert.deepEqual(posting.author, publisher);
  assert.equal(posting.url, `${origin}${route}`);
  const zhIndex = read('public/zh/blog/index.html');
  const enIndex = read('public/en/blog/index.html');
  const zhCards = [...zhIndex.matchAll(/<article class="blog-card">([\s\S]*?)<\/article>/g)].map(match => match[1]);
  assert.equal(zhCards.length, 4);
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

test('the approved slides-to-script article is published in both languages with the checked photos', () => {
  const slug = 'from-slides-to-script';
  const images = {
    'from-slides-to-script-demo-audience-display-and-mac-prompter.jpg': '41ff8d52295a34a2d8476fb22766cbe0b228b958be962a180dbe65342f79a303',
    'from-slides-to-script-demo-chart-slide-and-prompter.jpg': '481423dc6e4bd995b2fd704603e600ad1bdc8185416ae128125edc8c5d59bf74'
  };
  const copy = {
    zh: {
      hash: '4483de62fe3db4d2fc92639b46e1a43009f5566349d654acc17c01d1d3ae175b',
      title: '把幻灯片改成能开口讲的稿',
      seoTitle: '把幻灯片改成演讲稿：不要照着PPT念 · Oralo',
      limits: [
        '不能当作语音跟随、自动同步幻灯片，或真实人声识别已经实测通过的证据',
        '测试预览版还不是 App Store 中的正式 Mac 产品',
        '不保证能跳到任意较远的段落',
        '图中文案属于演示内容，不代表真实业务结果',
        '图中“+18%”“12 天”等为示例数据，不是真实业绩',
        '那篇文章以当时的预览条件为准，不代表所有会议软件或正式 Mac 版已经同样验收',
        '“两个流程”和“周三”只属于这个虚构示例',
        '这是文献里的设计提醒，不是我们做过的实验'
      ],
      links: [
        'https://oralo.fun/zh/blog/five-minute-work-update/',
        'https://oralo.fun/zh/blog/get-back-on-script/',
        'https://oralo.fun/zh/blog/dingtalk-window-casting-teleprompter/',
        'https://oralo.fun/zh/tools/speech-length/',
        'https://oralo.fun/zh/tools/speech-preview/',
        'https://oralo.fun/zh/voice-following/',
        'https://oralo.fun/zh/#macos',
        'https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605'
      ],
      alts: [
        '用户提供的示例演示实拍：后方显示器播放《季度业务进展汇报》幻灯片，前方 Mac 屏幕上方有粉色悬浮提词窗，键盘右侧有一只手。',
        '同一组示例演示中的图表页：显示器和 Mac 上都显示“+18%”和“12天”等示例数据，Mac 上仍有给讲者看的悬浮提词。'
      ]
    },
    en: {
      hash: 'c3e4b0360aa813edd5fc914860567bc71dc1829b99a1dcd798a4f755fa374df0',
      title: 'How to turn your slides into a script you can actually say',
      seoTitle: 'From Slides to a Speakable Script · Oralo',
      limits: [
        'it is not evidence that voice following, automatic slide sync, or live speech recognition has been tested successfully',
        'The preview is not a finished Mac App Store product',
        'A jump to a distant paragraph is not guaranteed',
        'The wording and figures on the slides are demonstration content, not a real team’s results',
        'The on-screen wording is demonstration content, not a real business result',
        'Figures such as “+18%” and “12 days” are sample data, not actual performance',
        '“Two workflows” and “Wednesday” belong to this made-up example',
        'That is a design warning from the literature, not a test we ran'
      ],
      links: [
        'https://oralo.fun/en/blog/five-minute-work-update/',
        'https://oralo.fun/en/blog/get-back-on-script/',
        'https://oralo.fun/en/tools/speech-length/',
        'https://oralo.fun/en/tools/speech-preview/',
        'https://oralo.fun/en/voice-following/',
        'https://oralo.fun/en/#macos',
        'https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605'
      ],
      alts: [
        'User-provided example demonstration: a large display shows a quarterly update slide, while a Mac in the foreground has a pink floating teleprompter window and a hand near the keyboard.',
        'The same example demonstration on a chart slide: both the display and the Mac show sample figures such as +18% and 12 days, with the speaker’s floating prompt still visible on the Mac.'
      ]
    }
  };
  for (const lang of ['zh', 'en']) {
    const source = read(`src/content/blog/${slug}.${lang}.md`);
    const body = source.replace(/^---\n[\s\S]*?\n---\n/, '');
    assert.equal(createHash('sha256').update(body).digest('hex'), copy[lang].hash);
    assert.match(source, /^status: published$/m);
    assert.match(source, /^reviewStatus: approved$/m);
    assert.match(source, /^draftedAt: 2026-11-25$/m);
    assert.match(source, new RegExp(`^datePublished: ${slidesPublishedPattern}$`, 'm'));
    assert.notEqual(slidesPublishedAt, '2026-11-25');
    assert.match(source, /^dateModified: null$/m);
    assert.match(source, /^author: null$/m);
    assert.doesNotMatch(source, /^author: (?!null$)/m);
    assert.doesNotMatch(source, /<!--|zh-article-|en-article-|内部交付说明|内部编辑说明|editorial-notes|candidates-unchecked|ready-for-publication|status: draft/);
    const route = `/${lang}/blog/${slug}/`;
    const html = read(`public${route}index.html`);
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    const article = visible.match(/<article class="blog-article">([\s\S]*?)<\/article>/)[1];
    assert.equal((visible.match(/<h1\b/g) || []).length, 1);
    assert.match(visible, new RegExp(`<title>${copy[lang].seoTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
    assert.match(visible, new RegExp(`<h1>${copy[lang].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`));
    assert.equal((article.match(/<h2\b/g) || []).length, 7);
    assert.equal((article.match(/<figure class="blog-figure">/g) || []).length, 2);
    assert.doesNotMatch(article, /<video\b|\.mp4|candidates-unchecked|自动提取|一键生成讲稿|自动翻页同步|\*用户提供|\*The same|\*A user|\*PLOS/);
    for (const sentence of copy[lang].limits) assert.ok(article.includes(sentence), sentence);
    for (const link of copy[lang].links) assert.match(article, new RegExp(`href="${link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    if (lang === 'en') assert.doesNotMatch(html, /dingtalk-window-casting-teleprompter/);
    assert.doesNotMatch(visible, /内部交付说明|内部编辑说明|editorial-notes|candidates-unchecked|contentId|reviewStatus|ready-for-publication|datePublished:|heroImage|status: draft|author:|seoTitle:|```|:\s*null\b|\bnull\b|zh-article-|en-article-|已测试成功/);
    assert.doesNotMatch(html, /<meta name="robots" content="noindex, nofollow">|blog-draft-banner|编辑预览，尚未发布|Editorial preview\. Not published/);
    assert.match(html, /data-content-status="published"/);
    assert.match(html, /data-review-status="approved"/);
    assert.match(html, /data-drafted-at="2026-11-25"/);
    assert.ok(html.includes(timeTag(slidesPublishedAt, lang)));
    assert.doesNotMatch(html, /<time datetime="2026-11-25">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${origin}${route}">`));
    assert.match(html, new RegExp(`hreflang="zh-Hans" href="${origin}/zh/blog/${slug}/"`));
    assert.match(html, new RegExp(`hreflang="en" href="${origin}/en/blog/${slug}/"`));
    assert.match(html, new RegExp(`hreflang="x-default" href="${origin}/en/blog/${slug}/"`));
    assert.match(html, new RegExp(`href="/zh/blog/${slug}/"[^>]*data-language-link="zh"`));
    assert.match(html, new RegExp(`href="/en/blog/${slug}/"[^>]*data-language-link="en"`));
    const names = Object.keys(images);
    for (const [index, name] of names.entries()) {
      const bytes = readFileSync(new URL(`../public${route}${name}`, import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), images[name], `${lang} ${name}`);
      const alt = copy[lang].alts[index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(html, new RegExp(`<img src="${route}${name}" alt="${alt}" width="1080" height="1920" loading="lazy" decoding="async">`));
    }
    const graph = JSON.parse(html.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const posting = graph['@graph'].find(node => node['@type'] === 'BlogPosting');
    assert.equal(posting.headline, copy[lang].title);
    assert.equal(posting.datePublished, slidesPublishedAt);
    assert.equal(posting.dateModified, undefined);
    assert.deepEqual(posting.author, publisher);
    assert.equal(posting.url, `${origin}${route}`);
    assert.ok(graph['@graph'].every(node => node['@type'] !== 'Person'));
    const index = read(`public/${lang}/blog/index.html`);
    const cards = [...index.matchAll(/<article class="blog-card">([\s\S]*?)<\/article>/g)].map(match => match[1]);
    assert.match(cards.at(-1), new RegExp(`href="${route}"`));
    assert.match(cards.at(-1), new RegExp(copy[lang].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(cards.at(-1).includes(timeTag(slidesPublishedAt, lang)));
    assert.doesNotMatch(cards.at(-1), /blog-draft-banner|编辑预览|Editorial preview/);
    assert.match(read('public/sitemap.xml'), new RegExp(`<loc>${origin}${route}</loc><lastmod>${slidesPublishedPattern}</lastmod>`));
    assert.doesNotMatch(read('public/sitemap.xml'), /from-slides-to-script\/[^<]|status: draft|noindex/);
  }
});
