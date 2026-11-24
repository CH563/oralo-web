import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const xPath = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.714-7.19L6.48 21.75H3.17l7.73-8.835L1.254 2.25H8.08l5.167 6.567L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const localized = ['zh', 'en'].flatMap(lang => [
  ['home', `/${lang}/`],
  ['feature', `/${lang}/voice-following/`],
  ['feature', `/${lang}/floating-prompt/`],
  ['tool', `/${lang}/tools/speech-length/`],
  ['tool', `/${lang}/tools/speech-preview/`],
  ['tool', `/${lang}/tools/microphone-test/`],
  ['tool', `/${lang}/tools/camera-test/`],
  ['blog', `/${lang}/blog/`],
  ['blog', `/${lang}/blog/five-minute-work-update/`],
  ['blog', `/${lang}/blog/get-back-on-script/`]
]);

function chrome(html, lang) {
  const headers = [...html.matchAll(/<header class="header[\s\S]*?<\/header>/g)].map(match => match[0]);
  const footers = [...html.matchAll(/<footer class="footer[\s\S]*?<\/footer>/g)].map(match => match[0]);
  const header = headers.find(item => item.includes(`href="/${lang}/blog/"`));
  const footer = footers.find(item => item.includes(`href="/${lang}/blog/"`));
  assert.ok(header, `missing shared header for ${lang}`);
  assert.ok(footer, `missing shared footer for ${lang}`);
  return {header, footer};
}

function hrefs(fragment) {
  return [...fragment.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
}

test('shared navigation and footer use the current language, include Blog, and link to X', () => {
  assert.match(read('src/templates/home.html'), /\{\{\{siteHeader\}\}\}/);
  assert.match(read('src/templates/home.html'), /\{\{\{siteFooter\}\}\}/);
  assert.doesNotMatch(read('src/templates/home.html'), /<nav |<footer /);
  const css = read('public/styles.css');
  assert.match(css, /@media\(max-width:700px\)\{[\s\S]*\.header\.wrap nav\{display:flex/);
  assert.match(css, /\.footer>div\{[^}]*align-items:center/);
  assert.match(css, /\.footer>div>\*\{[^}]*align-items:center[^}]*line-height:1/);
  assert.match(css, /\.footer-icon\{[^}]*width:24px[^}]*height:24px/);
  assert.match(css, /\.footer-icons\{[^}]*display:inline-flex[^}]*align-items:center[^}]*gap:20px/);
  assert.match(css, /@media\(max-width:1000px\)\{[^}]*\.footer-icons\{gap:14px\}/);
  assert.doesNotMatch(css, /\.footer>div a\{padding:8px 0\}/);
  assert.match(css, /@media\(max-width:700px\)\{[^}]*\.footer>div\{[^}]*justify-content:flex-start/);
  assert.match(css, /a:focus-visible[^{]*\{outline:3px solid var\(--blue\)/);

  for (const [kind, route] of localized) {
    const lang = route.split('/')[1];
    const html = read(`public${route}index.html`);
    const {header, footer} = chrome(html, lang);
    const other = lang === 'zh' ? 'en' : 'zh';
    const suffix = route.slice(3);
    assert.deepEqual(hrefs(header.match(/<nav[\s\S]*?<\/nav>/)[0]), [
      ...(kind === 'home' ? ['#inside', '#floating', '#mirror', '#faq'] : [`/${lang}/#inside`, `/${lang}/#floating`, `/${lang}/#mirror`, `/${lang}/#faq`]),
      `/${lang}/blog/`
    ], route);
    assert.match(header, new RegExp(`href="/${lang}/blog/"[^>]*>${lang === 'zh' ? '博客' : 'Blog'}</a>`));
    assert.match(header, new RegExp(`data-language-link="${lang}" aria-current="page"`));
    assert.match(header, new RegExp(`href="/${lang}${suffix}"`));
    assert.match(header, new RegExp(`href="/${other}${suffix}"`));
    assert.match(footer, new RegExp(`href="/${lang}/blog/"[^>]*>${lang === 'zh' ? '博客' : 'Blog'}</a>`));
    assert.match(footer, new RegExp(`href="/${lang}/tools/speech-length/"`));
    assert.match(footer, new RegExp(`href="/${lang}/tools/speech-preview/"`));
    assert.match(footer, new RegExp(`href="/support/\\?lang=${lang}"`));
    assert.match(footer, new RegExp(`href="/privacy/\\?lang=${lang}"`));
    assert.match(footer, /<span class="footer-icons"><a class="footer-icon" href="https:\/\/github\.com\/CH563\/oralo"[\s\S]*?<\/a><a class="footer-icon" href="https:\/\/x\.com\/LiWen563"[\s\S]*?<\/a><\/span>/);
    const github = footer.match(/<a class="footer-icon" href="https:\/\/github\.com\/CH563\/oralo" target="_blank" rel="noopener" aria-label="GitHub ↗">[\s\S]*?<\/a>/);
    assert.ok(github, route);
    assert.match(github[0], /<svg[^>]*width="14" height="14"[^>]*aria-hidden="true"/);
    assert.match(github[0], /fill="currentColor"/);
    assert.match(github[0], /M41\.4395 69\.3848/);
    assert.doesNotMatch(github[0], />GitHub/);
    const x = footer.match(/<a class="footer-icon" href="https:\/\/x\.com\/LiWen563"[^>]*>[\s\S]*?<\/a>/);
    assert.ok(x, route);
    assert.match(x[0], /<svg[^>]*width="14" height="14"/);
    assert.match(x[0], /href="https:\/\/x\.com\/LiWen563"/);
    assert.match(x[0], /target="_blank"/);
    assert.match(x[0], /rel="noopener noreferrer"/);
    assert.match(x[0], /aria-label="LiWen563 on X"/);
    assert.ok(x[0].includes(xPath), route);
    assert.doesNotMatch(x[0], /M23\.643|twitter\.com|twimg/);
    assert.doesNotMatch(html, /platform\.twitter|twttr|widgets\.js|googletagmanager|gtag\(|google-analytics/);
  }

  for (const slug of ['privacy', 'support']) {
    const html = read(`public/${slug}/index.html`);
    assert.equal(createHash('sha256').update(html.match(/<main[\s\S]*<\/main>/)[0]).digest('hex'), slug === 'privacy'
      ? '8c24202ee7ec09e33b25d436f735d04edc63ec0711142092fda4acf82235c1a5'
      : '30e734a929eedde859cf81a7497e992d4e31573d389ede97fe4a2eb2fe577cf0');
    assert.doesNotMatch(html, /info-header|info-footer|data-page-language/);
    assert.doesNotMatch(html, /navigation\.js/);
    for (const lang of ['zh', 'en']) {
      const {header, footer} = chrome(html, lang);
      assert.deepEqual(hrefs(header.match(/<nav[\s\S]*?<\/nav>/)[0]), [
        `/${lang}/#inside`, `/${lang}/#floating`, `/${lang}/#mirror`, `/${lang}/#faq`, `/${lang}/blog/`
      ]);
      assert.match(header, new RegExp(`href="/${slug}/\\?lang=${lang}" lang="${lang === 'zh' ? 'zh-Hans' : 'en'}"[^>]*aria-current="page"`));
      assert.match(header, new RegExp(`href="/${slug}/\\?lang=${lang === 'zh' ? 'en' : 'zh'}"`));
      assert.match(footer, /href="https:\/\/x\.com\/LiWen563" target="_blank" rel="noopener noreferrer"/);
      assert.match(footer, new RegExp(`href="/${lang}/blog/"`));
      assert.match(footer, new RegExp(`href="/support/\\?lang=${lang}"`));
      assert.match(footer, new RegExp(`href="/privacy/\\?lang=${lang}"`));
    }
  }
});
