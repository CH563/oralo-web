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

test('every published article uses the same column and keeps its contents list inside that column', () => {
  for (const file of articles) {
    const html = read(file);
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    assert.equal((visible.match(/<article class="blog-article">/g) || []).length, 1, file);
    assert.equal((visible.match(/<aside\b/g) || []).length, 0, file);
    assert.doesNotMatch(visible, /guide-block-illustrated|blog-sidebar|article-grid/, file);
    const article = visible.match(/<article class="blog-article">([\s\S]*?)<\/article>/)[1];
    assert.match(article, /<header class="guide-heading"><h1>/, file);
    assert.match(article, /<nav class="guide-contents"[^>]*>[\s\S]*<a href="#[^"]+">/, file);
    assert.equal(article.includes('<nav class="guide-contents"'), true, file);
  }
  const dingtalk = read(articles[4]);
  assert.equal((dingtalk.match(/<figure class="blog-figure">/g) || []).length, 2);
  assert.match(dingtalk, /dingtalk-window-casting-redacted\.jpg/);
  assert.match(dingtalk, /dingtalk-window-guide\.png/);
  assert.doesNotMatch(read('public/guides.css'), /\.blog-article/);
});
