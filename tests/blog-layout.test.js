import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const articles = [
  'public/zh/blog/five-minute-work-update/index.html',
  'public/en/blog/five-minute-work-update/index.html',
  'public/zh/blog/get-back-on-script/index.html',
  'public/en/blog/get-back-on-script/index.html',
  'public/zh/blog/dingtalk-window-casting-teleprompter/index.html',
  'public/zh/blog/from-slides-to-script/index.html',
  'public/en/blog/from-slides-to-script/index.html',
  'public/zh/blog/on-camera-update/index.html',
  'public/en/blog/on-camera-update/index.html',
  'public/zh/blog/one-minute-standup/index.html',
  'public/en/blog/one-minute-standup/index.html'
];

test('blog pages use the shared site column instead of a narrower reading measure', () => {
  const css = read('public/blog.css');
  const site = read('public/styles.css');
  assert.match(site, /\.wrap\{max-width:1120px;width:calc\(100% - 96px\);margin-inline:auto\}/);
  assert.doesNotMatch(css, /42rem|46rem|672px|736px/);
  assert.match(css, /\.blog-page \.guide-heading,\.blog-page \.guide-intro\{max-width:none\}/);
  assert.doesNotMatch(css, /\.blog-page\{[^}]*grid-template-columns|\.blog-page\{[^}]*display:\s*grid/);
  assert.match(css, /\.blog-figure img\{[^}]*max-width:100%/);
  assert.match(css, /\.blog-figure img\{[^}]*height:auto/);
  assert.doesNotMatch(read('public/guides.css'), /\.blog-article|\.blog-toc|max-width:none/);
});

test('every published article keeps one centered column and a side contents control outside that column', () => {
  const css = read('public/blog.css');
  assert.match(css, /\.blog-toc\{display:none\}/);
  assert.match(css, /@media\(min-width:1700px\)\{[^}]*\.blog-toc\{[^}]*position:fixed/);
  assert.match(css, /\.blog-toc button:focus-visible\{[^}]*outline:3px solid/);
  assert.match(css, /\.blog-toc \.guide-contents\{display:none\}/);
  assert.match(css, /\.blog-toc button\[aria-expanded=true\]\+\.guide-contents\{display:block/);
  assert.match(css, /\.blog-toc \.guide-contents a\[aria-current=location\]\{[^}]*color:var\(--blue\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.blog-toc button\[aria-expanded=true\]\+\.guide-contents\{animation:none\}/);
  assert.doesNotMatch(css, /blog-toc-drawer|blog-toc-backdrop|@media\(max-width:1239px\)\{[^}]*blog-toc[^}]*position:\s*fixed/);
  const script = read('public/blog-toc.js');
  assert.match(script, /aria-expanded/);
  assert.match(script, /aria-current/);
  assert.match(script, /event\.key !== 'Escape'/);
  assert.match(script, /button\.focus\(\)/);
  assert.match(script, /panel\.scrollTop/);
  assert.doesNotMatch(script, /scrollIntoView/);
  for (const file of articles) {
    const html = read(file);
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    assert.equal((visible.match(/<article class="blog-article">/g) || []).length, 1, file);
    assert.equal((visible.match(/<aside\b/g) || []).length, 0, file);
    assert.doesNotMatch(visible, /guide-block-illustrated|blog-sidebar|article-grid/, file);
    const label = file.includes('/zh/') ? '目录' : 'Contents';
    assert.match(visible, new RegExp(`<div class="blog-toc"><button type="button" aria-expanded="false" aria-controls="blog-toc-panel">${label}</button><nav id="blog-toc-panel" class="guide-contents" aria-label="${label}"><ul><li><a href="#[^"]+">`), file);
    assert.match(html, /<script type="module" src="\/blog-toc\.js"><\/script>/, file);
    const article = visible.match(/<article class="blog-article">([\s\S]*?)<\/article>/)[1];
    assert.match(article, /<header class="guide-heading"><h1>/, file);
    assert.equal(article.includes('<nav class="guide-contents"'), false, file);
    assert.equal(article.includes('class="blog-toc"'), false, file);
  }
  const dingtalk = read(articles[4]);
  assert.equal((dingtalk.match(/<figure class="blog-figure">/g) || []).length, 2);
  assert.match(dingtalk, /dingtalk-window-casting-redacted\.jpg/);
  assert.match(dingtalk, /dingtalk-window-guide\.png/);
  assert.doesNotMatch(read('public/guides.css'), /\.blog-article|\.blog-toc/);
});

test('the shared blog index uses the site column and keeps the published card order', () => {
  const css = read('public/blog.css');
  assert.match(css, /\.blog-list\{display:grid;gap:18px\}/);
  assert.doesNotMatch(css, /\.blog-list\{[^}]*max-width/);
  for (const file of ['public/zh/blog/index.html', 'public/en/blog/index.html']) {
    const html = read(file);
    assert.match(html, /<main id="main" class="wrap guide-page blog-page"/, file);
    assert.match(html, /<div class="blog-list"><article class="blog-card">/, file);
    assert.doesNotMatch(html, /class="blog-article"|class="blog-toc"|blog-toc\.js/, file);
    const cards = [...html.matchAll(/<article class="blog-card">([\s\S]*?)<\/article>/g)].map(match => match[1]);
    const hrefs = cards.map(card => card.match(/href="([^"]+)"/)[1]);
    if (file.includes('/zh/')) {
      assert.deepEqual(hrefs, [
        '/zh/blog/five-minute-work-update/',
        '/zh/blog/get-back-on-script/',
        '/zh/blog/dingtalk-window-casting-teleprompter/',
        '/zh/blog/from-slides-to-script/',
        '/zh/blog/on-camera-update/',
        '/zh/blog/one-minute-standup/'
      ]);
    } else {
      assert.deepEqual(hrefs, [
        '/en/blog/five-minute-work-update/',
        '/en/blog/get-back-on-script/',
        '/en/blog/from-slides-to-script/',
        '/en/blog/on-camera-update/',
        '/en/blog/one-minute-standup/'
      ]);
    }
  }
});
