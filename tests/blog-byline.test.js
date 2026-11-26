import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {blogPublisher, publicationLabel, publisherMarkup, shanghaiParts} from '../scripts/blog-byline.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const pages = [
  ['zh', 'five-minute-work-update', '2026-11-23T18:06:07+08:00', '2026年11月23日 18:06'],
  ['en', 'five-minute-work-update', '2026-11-23T18:06:07+08:00', 'Nov 23, 2026, 18:06'],
  ['zh', 'get-back-on-script', '2026-11-24T12:43:08+08:00', '2026年11月24日 12:43'],
  ['en', 'get-back-on-script', '2026-11-24T12:43:08+08:00', 'Nov 24, 2026, 12:43'],
  ['zh', 'dingtalk-window-casting-teleprompter', '2026-11-24T19:22:47+08:00', '2026年11月24日 19:22'],
  ['zh', 'from-slides-to-script', '2026-11-25T10:42:42+08:00', '2026年11月25日 10:42'],
  ['en', 'from-slides-to-script', '2026-11-25T10:42:42+08:00', 'Nov 25, 2026, 10:42'],
  ['zh', 'on-camera-update', '2026-11-26T10:36:00+08:00', '2026年11月26日 10:36'],
  ['en', 'on-camera-update', '2026-11-26T10:36:00+08:00', 'Nov 26, 2026, 10:36']
];

test('publication labels use the Asia/Shanghai clock without shifting to the runtime zone', () => {
  assert.deepEqual(shanghaiParts('2026-11-23T18:06:07+08:00'), {year: 2026, month: 11, day: 23, hour: '18', minute: '06'});
  assert.equal(publicationLabel('2026-11-25T16:00:00Z', 'zh'), '2026年11月26日 00:00');
  assert.equal(publicationLabel('2026-11-25T16:00:00Z', 'en'), 'Nov 26, 2026, 00:00');
  assert.equal(publicationLabel('2026-11-25T10:42:42+08:00', 'zh'), '2026年11月25日 10:42');
  assert.equal(publicationLabel('2026-11-25T10:42:42+08:00', 'en'), 'Nov 25, 2026, 10:42');
  for (const label of ['2026年11月25日 10:42', 'Nov 25, 2026, 10:42']) {
    assert.doesNotMatch(label, /\+08:00|CST|UTC|GMT|时区/);
  }
});

test('every published article names LiWen Chen and shows the Shanghai time', () => {
  const avatar = read('public/assets/liwen-chen.jpg');
  assert.equal(avatar[0], 0xFF);
  assert.equal(avatar[1], 0xD8);
  assert.equal(createHash('sha256').update(avatar).digest('hex'), 'fa8e0458f975b4f896226f08c9263977fdf6e1d34963096faca0cbba07e0cf9e');
  assert.equal(blogPublisher.avatarWidth, 387);
  assert.equal(blogPublisher.avatarHeight, 387);
  for (const [lang, slug, iso, label] of pages) {
    const html = read(`public/${lang}/blog/${slug}/index.html`).toString();
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    const byline = publisherMarkup(lang);
    assert.ok(visible.includes(byline), `${lang}/${slug}`);
    assert.ok(visible.includes(`<time datetime="${iso}">${label}</time>`), `${lang}/${slug}`);
    assert.equal((visible.match(new RegExp(`datetime="${iso.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length, 1, `${lang}/${slug}`);
    const timeText = visible.match(/<time datetime="[^"]+">([^<]+)<\/time>/)[1];
    assert.equal(timeText, label);
    assert.doesNotMatch(timeText, /\+08:00|CST|UTC|GMT|时区/);
    assert.doesNotMatch(visible, /dateModified|twitter\.com|platform\.twitter|widgets\.js/);
    assert.match(visible, /M18\.244 2\.25h3\.308/);
    assert.doesNotMatch(visible, /M23\.643/);
    const graph = JSON.parse(html.match(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const posting = graph['@graph'].find(node => node['@type'] === 'BlogPosting');
    assert.equal(posting.datePublished, iso);
    assert.equal(posting.dateModified, undefined);
    assert.deepEqual(posting.author, {
      '@type': 'Person',
      name: 'LiWen Chen',
      url: 'https://x.com/LiWen563',
      image: 'https://oralo.fun/assets/liwen-chen.jpg',
      sameAs: ['https://x.com/LiWen563', 'https://github.com/CH563']
    });
  }
  for (const lang of ['zh', 'en']) {
    const index = read(`public/${lang}/blog/index.html`).toString();
    const times = [...index.matchAll(/<time datetime="([^"]+)">([^<]+)<\/time>/g)];
    assert.ok(times.length >= 3, lang);
    for (const [, iso, label] of times) {
      assert.equal(label, publicationLabel(iso, lang));
      assert.doesNotMatch(label, /\+08:00|CST|UTC|GMT|时区/);
    }
    assert.doesNotMatch(index, /blog-byline|liwen-chen/);
  }
});
