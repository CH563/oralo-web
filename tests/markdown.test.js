import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../scripts/render-markdown.mjs';

test('markdown renderer keeps article structure and drops unsafe URLs', () => {
  const {html, toc} = renderMarkdown(`# Title to skip

Intro with **emphasis** and \`900\`.

## 先写清楚目标

A [safe link](https://oralo.fun/zh/tools/speech-length/) and a [blocked link](http://example.com/x) plus [script](javascript:alert(1)).

| Step | Time |
| --- | --- |
| Opening | 30 |

> Remember <script>alert(1)</script>

- one
- two
`);
  assert.equal((html.match(/<h1\b/g) || []).length, 0);
  assert.equal(toc.length, 1);
  assert.match(html, /<h2 id="[^"]+">先写清楚目标<\/h2>/);
  assert.match(html, /<strong>emphasis<\/strong>/);
  assert.match(html, /<code>900<\/code>/);
  assert.match(html, /<a href="https:\/\/oralo\.fun\/zh\/tools\/speech-length\/">safe link<\/a>/);
  assert.doesNotMatch(html, /href="http:|href="javascript:|<script/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<th scope="col">Step<\/th>/);
  assert.match(html, /<th scope="row">Opening<\/th>/);
  assert.match(html, /<blockquote><p>Remember/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

test('markdown emphasis renders captions and titles without leaving the marker', () => {
  const {html} = renderMarkdown(`**Before:** read the bullets.

In *PLOS Computational Biology*, one idea is enough.

*Sample figures such as +18% are not actual performance.*
`);
  assert.match(html, /<strong>Before:<\/strong> read the bullets\./);
  assert.match(html, /In <em>PLOS Computational Biology<\/em>, one idea is enough\./);
  assert.match(html, /<p><em>Sample figures such as \+18% are not actual performance\.<\/em><\/p>/);
  assert.doesNotMatch(html, /\*/);
});

test('markdown images keep approved local files and drop remote or unsafe sources', () => {
  const {html, images} = renderMarkdown(`![现场照片](dingtalk-window-casting-redacted.jpg)

![指南](dingtalk-window-guide.png)

![远程](https://example.com/secret.jpg)

![穿越](../original.jpg)
`, {
    resolveImage: name => ({src: `/zh/blog/dingtalk-window-casting-teleprompter/${name}`, width: 1280, height: 1707})
  });
  assert.deepEqual(images, ['dingtalk-window-casting-redacted.jpg', 'dingtalk-window-guide.png']);
  assert.match(html, /<img src="\/zh\/blog\/dingtalk-window-casting-teleprompter\/dingtalk-window-casting-redacted.jpg" alt="现场照片" width="1280" height="1707" loading="lazy" decoding="async">/);
  assert.match(html, /!\[远程\]\(https:\/\/example\.com\/secret\.jpg\)/);
  assert.match(html, /!\[穿越\]\(\.\.\/original\.jpg\)/);
  assert.doesNotMatch(html, /<(?:a|img)\b[^>]*(?:href|src)="(?:https?:|javascript:|\.\.|data:)/);
});
