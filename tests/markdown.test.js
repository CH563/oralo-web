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
