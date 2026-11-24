import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const articles = [
  'public/zh/blog/five-minute-work-update/index.html',
  'public/en/blog/five-minute-work-update/index.html',
  'public/zh/blog/get-back-on-script/index.html',
  'public/en/blog/get-back-on-script/index.html',
  'public/zh/blog/dingtalk-window-casting-teleprompter/index.html'
];

test('the shared article column stays a centered reading measure, not a full-width or sidebar grid', () => {
  const css = read('public/blog.css');
  const articleRule = css.match(/\.blog-article\{([^}]*)\}/);
  assert.ok(articleRule, 'public/blog.css is missing .blog-article');
  assert.match(articleRule[1], /max-width:42rem/);
  assert.match(articleRule[1], /margin-inline:auto/);
  assert.doesNotMatch(articleRule[1], /max-width:\s*(?:none|100%|1120px)|width:\s*(?:100%|1120px)|grid-template-columns|display:\s*grid/);
  assert.doesNotMatch(css, /\.blog-page\{[^}]*grid-template-columns|\.blog-page\{[^}]*display:\s*grid/);
  assert.match(css, /\.blog-page:has\(>\.blog-article\)>\.guide-breadcrumb,\.blog-page:has\(>\.blog-article\)>\.blog-draft-banner\{max-width:42rem;margin-inline:auto\}/);
  assert.match(css, /\.blog-figure img\{[^}]*max-width:100%/);
  assert.match(css, /\.blog-figure img\{[^}]*height:auto/);
});

test('every published article keeps one centered column and a side contents control outside that column', () => {
  const css = read('public/blog.css');
  assert.match(css, /\.blog-toc\{display:none\}/);
  assert.match(css, /@media\(min-width:1240px\)\{[^}]*\.blog-toc\{[^}]*position:fixed/);
  assert.match(css, /\.blog-toc button:focus-visible\{[^}]*outline:3px solid/);
  assert.match(css, /\.blog-toc \.guide-contents\{display:none\}/);
  assert.match(css, /\.blog-toc button\[aria-expanded=true\]\+\.guide-contents\{display:block/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.blog-toc button\[aria-expanded=true\]\+\.guide-contents\{animation:none\}/);
  assert.doesNotMatch(css, /blog-toc-drawer|blog-toc-backdrop|@media\(max-width:1239px\)\{[^}]*blog-toc[^}]*position:\s*fixed/);
  const script = read('public/blog-toc.js');
  assert.match(script, /aria-expanded/);
  assert.match(script, /event\.key !== 'Escape'/);
  assert.match(script, /button\.focus\(\)/);
  for (const file of articles) {
    const html = read(file);
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    assert.equal((visible.match(/<article class="blog-article">/g) || []).length, 1, file);
    assert.equal((visible.match(/<aside\b/g) || []).length, 0, file);
    assert.doesNotMatch(visible, /guide-block-illustrated|blog-sidebar|article-grid/, file);
    const label = file.includes('/zh/') ? '目录' : 'Contents';
    assert.match(visible, new RegExp(`<div class="blog-toc"><button type="button" aria-expanded="false" aria-controls="blog-toc-panel">${label}</button><nav id="blog-toc-panel" class="guide-contents" aria-label="${label}"><ul><li><a href="#[^"]+">`), file);
    assert.match(html, /<script src="\/blog-toc\.js" defer><\/script>/, file);
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

test('the shared blog index is centered on its own measure and does not reuse the article width', () => {
  const css = read('public/blog.css');
  assert.match(css, /\.blog-page:not\(:has\(>\.blog-article\)\)>\.guide-breadcrumb,\.blog-page:not\(:has\(>\.blog-article\)\)>\.guide-heading,\.blog-page:not\(:has\(>\.blog-article\)\)>\.blog-list,\.blog-page:not\(:has\(>\.blog-article\)\)>\.blog-draft-banner\{max-width:46rem;margin-inline:auto\}/);
  assert.doesNotMatch(css.match(/\.blog-page:not\(:has\(>\.blog-article\)\)[^}]*\}/)[0], /42rem|672px/);
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
        '/zh/blog/dingtalk-window-casting-teleprompter/'
      ]);
    } else {
      assert.deepEqual(hrefs, [
        '/en/blog/five-minute-work-update/',
        '/en/blog/get-back-on-script/'
      ]);
    }
  }
});
