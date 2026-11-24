import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { origin, structuredData, structuredDataScript } from './structured-data.mjs';
import { renderMarkdown } from './render-markdown.mjs';
import { deviceCopy } from '../src/content/device-tools.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFile(path.join(root, name), 'utf8');
const locales = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/${lang}.json`))])));
const guides = JSON.parse(await read('src/content/guides.json'));
const englishScreenshots = JSON.parse(await read('src/content/english-screenshots.json'));
const chineseScreenshots = JSON.parse(await read('src/content/chinese-screenshots.json'));
const samples = JSON.parse(await read('src/content/guide-samples.json'));
const downloads = JSON.parse(await read('src/content/download.json'));
const tools = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/speech-length-${lang}.json`))])));
const previews = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/speech-preview-${lang}.json`))])));
const templates = Object.fromEntries(await Promise.all(['home', 'header', 'footer', 'floating', 'speech-length', 'speech-preview', 'device-tool'].map(async name => [name, await read(`src/templates/${name}.html`)])));
const blogIndexCopy = JSON.parse(await read('src/content/blog-index.json'));
const product = JSON.parse(await read('src/content/product.json'));
const appStoreUrl = product.appStoreUrl;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(template, context) {
  const value = key => {
    if (!(key in context)) throw new Error(`Missing template key: ${key}`);
    return context[key];
  };
  return template.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, raw, text) => raw ? value(raw) : escape(value(text)));
}
function contextFor(lang, slug = '') {
  const suffix = slug ? `${slug}/` : '';
  return {...locales[lang], macReleaseUrl: product.macPreview.releaseUrl, macVersion: product.macPreview.version, macMinimumOS: product.macPreview.minimumOS, macArchitectures: product.macPreview.architectures, imageSuffix: lang === 'en' ? '-en' : '', ipadWidth: lang === 'en' ? englishScreenshots.screenshots.ipad.width : 2420, ipadHeight: lang === 'en' ? englishScreenshots.screenshots.ipad.height : 1668, mirrorHeight: lang === 'en' ? 1566 : 960, desktopDownload: desktopDownload(lang), desktopDownloadJump: lang === 'en' ? 'Scan QR code or copy link' : '扫码或复制下载链接', appStoreUrl, developerName:product.developer.name, developerUrl:product.developer.url, slug, language:lang, htmlLang:lang === 'zh' ? 'zh-Hans' : 'en',
    homePath:`/${lang}/`, voicePath:`/${lang}/voice-following/`, floatingPath:`/${lang}/floating-prompt/`, toolPath:`/${lang}/tools/speech-length/`, previewPath:`/${lang}/tools/speech-preview/`, micPath:`/${lang}/tools/microphone-test/`, cameraPath:`/${lang}/tools/camera-test/`, blogPath:`/${lang}/blog/`,
    enPath:`/en/${suffix}`, zhPath:`/zh/${suffix}`, enCurrent:lang === 'en' ? 'page' : 'false', zhCurrent:lang === 'zh' ? 'page' : 'false', enLinkAttrs:' hreflang="en"',
    canonical:`${origin}/${lang}/${suffix}`, ogLocale:lang === 'zh' ? 'zh_CN' : 'en_US', alternateLocale:lang === 'zh' ? 'en_US' : 'zh_CN'};
}
function document(context, body, home, tool = false, extras = {}) {
  const schema = structuredData({
    canonical: context.canonical, title: context.pageTitle, description: context.pageDescription,
    language: context.htmlLang, kind: extras.kind || (home ? 'home' : tool ? 'tool' : 'guide'), product, copy: context,
    article: extras.article, breadcrumb: extras.breadcrumb || (home ? undefined : [
      {name: context.breadcrumbHome, url: `${origin}${context.homePath}`},
      {name: tool ? context.pageName : guides[context.slug][context.language].fields.H1, url: context.canonical}
    ])
  });
  const ogTitle = escape(extras.ogTitle || context.pageTitle);
  const c = Object.fromEntries(Object.entries(context).map(([k,v])=>[k,escape(v)]));
  const hreflang = context.monolingual === 'zh'
    ? `  <link rel="alternate" hreflang="zh-Hans" href="${origin}${c.zhPath}">\n  <link rel="alternate" hreflang="x-default" href="${origin}${c.zhPath}">`
    : `  <link rel="alternate" hreflang="zh-Hans" href="${origin}${c.zhPath}">\n  <link rel="alternate" hreflang="en" href="${origin}${c.enPath}">\n  <link rel="alternate" hreflang="x-default" href="${origin}${c.enPath}">`;
  const ogLocales = `  <meta property="og:url" content="${c.canonical}"><meta property="og:locale" content="${c.ogLocale}">${context.alternateLocale ? `<meta property="og:locale:alternate" content="${c.alternateLocale}">` : ''}`;
  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#faf9f5">
  <meta name="apple-itunes-app" content="app-id=6835449605">
  <title>${c.pageTitle}</title>
  <meta name="description" content="${c.pageDescription}">
  ${extras.robots ? `<meta name="robots" content="${escape(extras.robots)}">` : ''}
  <link rel="canonical" href="${c.canonical}">
${hreflang}
  <meta property="og:type" content="website"><meta property="og:site_name" content="Oralo">
${ogLocales}
  <meta property="og:title" content="${ogTitle}"><meta property="og:description" content="${c.pageDescription}">
  <meta property="og:image" content="${origin}/assets/oralo-social-v1.jpg?v=20261122-badges"><meta property="og:image:secure_url" content="${origin}/assets/oralo-social-v1.jpg?v=20261122-badges">
  <meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${c.socialAlt}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${ogTitle}"><meta name="twitter:description" content="${c.pageDescription}">
  <meta name="twitter:image" content="${origin}/assets/oralo-social-v1.jpg?v=20261122-badges"><meta name="twitter:image:alt" content="${c.socialAlt}">
  ${structuredDataScript(schema)}
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/download.css"><script type="module" src="/download.js"></script>${tool === 'device' ? '<link rel="stylesheet" href="/tools/speech-length.css"><link rel="stylesheet" href="/tools/device-tool.css">' : tool === 'blog' ? '<link rel="stylesheet" href="/guides.css"><link rel="stylesheet" href="/blog.css">' : tool ? '<link rel="stylesheet" href="/tools/speech-length.css">' : home ? '<link rel="stylesheet" href="/macos.css">' : '<link rel="stylesheet" href="/guides.css">'}
  ${tool === 'preview' ? '<link rel="stylesheet" href="/tools/speech-preview.css"><script type="module" src="/tools/speech-preview.js"></script>' : tool === 'device' ? '<script type="module" src="/tools/device-tool.js"></script>' : tool === 'blog' ? '<script src="/navigation.js" defer></script>' : tool ? '<script type="module" src="/tools/speech-tool.js"></script>' : '<script src="/navigation.js" defer></script>'}
  ${home ? '<script src="/translations.js" defer></script><script src="/app.js" defer></script><script src="/mirror-demo.js" defer></script>' : ''}
</head>
<body>${body}</body>
</html>
`.replace(/[ \t]+$/gm, '');
}
const guideScreenshots = { en: englishScreenshots, zh: chineseScreenshots };
function guideImage({asset, alt, caption, source: provenance}, lang) {
  const {widths, width, height} = guideScreenshots[lang].screenshots[asset];
  const source = size => `/assets/app-${asset}-${lang}-${size}.webp`;
  const wide = asset === 'floating';
  return `<figure class="guide-capture${wide ? ' guide-capture-wide' : ''}"><a href="${source(widths[1])}" target="_blank" rel="noopener"><img src="${source(widths[0])}" srcset="${widths.map(size => `${source(size)} ${size}w`).join(', ')}" sizes="${wide ? '(max-width: 700px) calc(100vw - 48px), 380px' : '(max-width: 700px) 220px, 250px'}" width="${width}" height="${height}" loading="lazy" decoding="async" alt="${escape(alt)}"></a><figcaption>${escape(caption)}${provenance ? `<span class="guide-capture-source">${escape(provenance)}</span>` : ''}</figcaption></figure>`;
}
function guideSection(section, lang) {
  const entries = (items, ordered) => `<${ordered ? 'ol class="guide-steps"' : 'ul class="guide-checks"'}>${items.map(item => `<li><h3>${escape(item.title)}</h3><p>${escape(item.text)}</p></li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
  const evidence = section.evidence;
  return `<section id="${escape(section.id)}" class="guide-block${section.image ? ' guide-block-illustrated' : ''}" aria-labelledby="${escape(section.id)}-title"><div class="guide-copy"><h2 id="${escape(section.id)}-title">${escape(section.title)}</h2>
    ${section.intro ? `<p class="guide-section-intro">${escape(section.intro)}</p>` : ''}
    ${section.steps ? entries(section.steps, true) : ''}${section.items ? entries(section.items, false) : ''}
    ${evidence ? `<div class="guide-evidence"><table><caption>${escape(section.title)}</caption><thead><tr>${evidence.headers.map(label => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead><tbody>${evidence.rows.map(row => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${escape(cell)}</th>` : `<td><span class="guide-evidence-label" aria-hidden="true">${escape(evidence.headers[index])}</span>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    ${section.note ? `<p class="guide-note">${escape(section.note)}</p>` : ''}
  </div>${section.image ? guideImage(section.image, lang) : ''}</section>`;
}
function desktopDownload(lang) {
  const copy = downloads[lang];
  return `<section id="download-transfer" class="desktop-download" aria-labelledby="download-transfer-title" data-download>
    <div class="download-scan"><a href="${escape(appStoreUrl)}"><img src="/assets/app-store-qr.png" width="164" height="164" loading="lazy" alt="${escape(copy.alt)}"></a><div><h3 id="download-transfer-title">${escape(copy.title)}</h3><p>${escape(copy.scan)}</p></div></div>
    <label for="app-store-link">${escape(copy.linkLabel)}</label><div class="download-copy-row"><input id="app-store-link" data-download-link type="url" value="${escape(appStoreUrl)}" readonly spellcheck="false" autocomplete="off"><button type="button" data-copy-download data-copied="${escape(copy.copied)}" data-fallback="${escape(copy.fallback)}" hidden>${escape(copy.copy)}</button></div>
    <p class="download-copy-status" data-copy-status role="status" aria-live="polite" aria-atomic="true"></p><p class="download-transfer-note">${escape(copy.note)}</p>
  </section>`;
}
function guideSample(lang) {
  const sample = samples[lang];
  return `<section id="sample" class="guide-sample" aria-labelledby="sample-title"><div><span class="kicker">${lang === 'en' ? 'PRACTICE SCRIPT' : '练习讲稿'}</span><h2 id="sample-title">${escape(sample.title)}</h2><p>${escape(sample.intro)}</p><a class="section-link" href="/samples/work-update-${lang}.txt" download="oralo-work-update-${lang}.txt">${escape(sample.download)} ↓</a></div><div class="guide-sample-text">${sample.paragraphs.map(text => `<p>${escape(text)}</p>`).join('')}</div><p class="guide-sample-note">${escape(sample.note)}</p></section>`;
}
function guideBody(lang, slug, c) {
  const page = guides[slug][lang];
  const floating = slug === 'floating-prompt';
  const guide = page.guide;
  const otherPath = floating ? c.voicePath : c.floatingPath;
  const otherLabel = floating ? c.voiceLearn : c.floatingLearn;
  const badge = `<a class="app-store-badge" href="${c.appStoreUrl}"><img src="/assets/app-store-badge.svg" alt="${escape(c.downloadLabel)}" width="120" height="40"></a>`;
  const chrome = html => render(html,c).replace(/href="#(.*?)"/g,`href="${c.homePath}#$1"`);
  return `
<a class="skip" href="#main">${escape(c.skip)}</a>
${chrome(templates.header)}
<main id="main" class="wrap guide-page">
  <div class="guide-heading"><nav class="guide-back guide-breadcrumb" aria-label="${escape(c.breadcrumbLabel)}"><a href="${c.homePath}">${escape(c.breadcrumbHome)}</a><span aria-hidden="true">›</span><span aria-current="page">${escape(page.fields.H1)}</span></nav><span class="kicker">${escape(guide.label)}</span><h1>${escape(page.fields.H1)}</h1><p class="guide-intro">${escape(page.paragraphs[0])}</p><div class="guide-actions">${badge}<a class="section-link" href="#sample">${escape(guide.startLabel)} ↓</a></div></div>
  <nav class="guide-contents" aria-label="${escape(guide.contentsLabel)}"><span>${escape(guide.contentsLabel)}</span><ul><li><a href="#sample">${escape(samples[lang].title)}</a></li>${guide.sections.map(section => `<li><a href="#${escape(section.id)}">${escape(section.title)}</a></li>`).join('')}</ul></nav>
  ${guideSample(lang)}
  <article class="guide-article">${guide.sections.map(section => guideSection(section, lang)).join('\n')}</article>
  <section id="faq" class="guide-faq"><h2>${escape(c.guideFaqTitle)}</h2><div class="faq-list">${page.faqs.map(([q,a])=>`<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n')}</div></section>
  <section class="guide-cta"><span class="kicker">${escape(c.guideRelated)}</span><h2>${escape(c.guideCtaTitle)}</h2>${badge}<p>${escape(c.guideCtaNote)}</p>${desktopDownload(lang)}<a class="section-link" href="${otherPath}">${escape(otherLabel)} ↗</a></section>
</main>
${chrome(templates.footer)}
`;
}
await mkdir(path.join(root, 'public/samples'), {recursive: true});
for (const lang of ['en', 'zh']) {
  await writeFile(path.join(root, `public/samples/work-update-${lang}.txt`), samples[lang].paragraphs.join('\n\n') + '\n');
}
const urls=[];
const lastmod = new Map();
function chromeFor(lang, paths = {}) {
  const context = {...contextFor(lang), ...paths};
  return {
    header: render(templates.header, context).replace(/href="#(.*?)"/g, `href="${context.homePath}#$1"`),
    footer: render(templates.footer, context)
  };
}
for (const lang of ['zh','en']) {
  const c=contextFor(lang);
  const homeChrome = {header: render(templates.header, c), footer: render(templates.footer, c)};
  await mkdir(path.join(root,`public/${lang}`),{recursive:true});
  await writeFile(path.join(root,`public/${lang}/index.html`),document(c,render(templates.home,{...c, siteHeader:homeChrome.header, siteFooter:homeChrome.footer}),true));
  urls.push(c.canonical);
  for (const slug of ['voice-following','floating-prompt']) {
    const context={...contextFor(lang,slug),pageTitle:guides[slug][lang].fields.title,pageDescription:guides[slug][lang].fields.description};
    await mkdir(path.join(root,`public/${lang}/${slug}`),{recursive:true});
    await writeFile(path.join(root,`public/${lang}/${slug}/index.html`),document(context,guideBody(lang,slug,context),false));
    urls.push(context.canonical);
  }
}
for (const lang of ['zh', 'en']) {
  const base = contextFor(lang, 'tools/speech-length');
  const c = {...base, ...tools[lang]};
  const chrome = html => render(html, base).replace(/href="#(.*?)"/g, `href="${c.homePath}#$1"`);
  const context = {...c, pageName: c.breadcrumb.split('›').at(-1).trim(), breadcrumbHome: c.breadcrumb.split('›')[0].trim(),
    zhSelected: lang === 'zh' ? 'selected' : '', enSelected: lang === 'en' ? 'selected' : '',
    zhHidden: lang === 'zh' ? '' : 'hidden', enHidden: lang === 'en' ? '' : 'hidden',
    siteHeader: chrome(templates.header), siteFooter: chrome(templates.footer),
    faqHtml: c.faqs.map(([q,a]) => `<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n'),
    runtimeCopy: JSON.stringify(tools[lang]).replace(/</g, '\\u003c')};
  const directory = path.join(root, `public/${lang}/tools/speech-length`);
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(directory, 'index.html'), document(context, render(templates['speech-length'], context), false, true));
  urls.push(c.canonical);
}
for (const lang of ['zh', 'en']) {
  const base = contextFor(lang, 'tools/speech-preview');
  const c = {...base, ...previews[lang]};
  const chrome = html => render(html, base).replace(/href="#(.*?)"/g, `href="${c.homePath}#$1"`);
  const context = {...c, pageName:c.breadcrumb.split('›').at(-1).trim(), breadcrumbHome:c.breadcrumb.split('›')[0].trim(),
    zhSelected:lang === 'zh' ? 'selected' : '', enSelected:lang === 'en' ? 'selected' : '',
    siteHeader:chrome(templates.header), siteFooter:chrome(templates.footer),
    faqHtml:c.faqs.map(([q,a]) => `<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n'),
    runtimeCopy:JSON.stringify(previews[lang]).replace(/</g, '\\u003c')};
  const directory = path.join(root, `public/${lang}/tools/speech-preview`);
  await mkdir(directory, {recursive:true});
  await writeFile(path.join(directory, 'index.html'), document(context, render(templates['speech-preview'], context), false, 'preview'));
  urls.push(c.canonical);
}
await writeFile(path.join(root,'public/translations.js'),`// Generated by scripts/build-site.mjs from src/content/.\nconst translations = ${JSON.stringify(locales)};\n`);
await writeFile(path.join(root,'public/index.html'),'<!doctype html>\n<html lang="zh-Hans"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=/zh/"><title>Oralo</title><link rel="canonical" href="https://oralo.fun/zh/"></head><body><a href="/zh/">Oralo</a></body></html>\n');
// These bilingual information pages are authored as static HTML. Replace only
// the managed data block, so repeated builds cannot duplicate schema or page copy.
for (const slug of ['privacy', 'support']) {
  const file = `public/${slug}/index.html`;
  const shared = ['zh', 'en'].map(lang => {
    const chrome = chromeFor(lang, {zhPath: `/${slug}/?lang=zh`, enPath: `/${slug}/?lang=en`});
    const hidden = lang === 'zh' ? ' hidden' : '';
    return {
      header: chrome.header.replace('<header class="header wrap">', `<header class="header wrap" data-content-language="${lang}"${hidden}>`),
      footer: chrome.footer.replace('<footer class="footer wrap">', `<footer class="footer wrap" data-content-language="${lang}"${hidden}>`)
    };
  });
  const headerMarkup = `<!-- shared-header -->${shared.map(item => item.header).join('')}<!-- /shared-header -->`;
  const footerMarkup = `<!-- shared-footer -->${shared.map(item => item.footer).join('')}<!-- /shared-footer -->`;
  const html = (await read(file))
    .replace(/\n?<script id="site-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
    .replace(/<!-- shared-header -->[\s\S]*?<!-- \/shared-header -->|<header class="header info-header[\s\S]*?<\/header>/, headerMarkup)
    .replace(/<!-- shared-footer -->[\s\S]*?<!-- \/shared-footer -->|<footer class="info-footer[\s\S]*?<\/footer>/, footerMarkup);
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)[1];
  const alternateName = html.match(/data-zh-title="([^"]+)"/)[1];
  const schema = structuredData({canonical: `${origin}/${slug}/`, title, description,
    language: ['en', 'zh-Hans'], kind: slug, alternateName});
  await writeFile(path.join(root, file), html.replace('</head>', `\n${structuredDataScript(schema)}</head>`));
  urls.push(`${origin}/${slug}/`);
}
function parseFrontMatter(raw, name) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${name} is missing front matter`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const cut = line.indexOf(':');
    if (cut < 1) throw new Error(`${name} has an invalid front matter line`);
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if (value === 'null') value = null;
    else if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    meta[key] = value;
  }
  return {meta, markdown: match[2]};
}
function publishedArticle(meta) {
  return meta.status === 'published';
}
const blogArticles = [];
for (const name of (await readdir(path.join(root, 'src/content/blog'))).filter(name => name.endsWith('.md')).sort()) {
  const lang = name.endsWith('.zh.md') ? 'zh' : name.endsWith('.en.md') ? 'en' : '';
  if (!lang) throw new Error(`Unexpected blog filename: ${name}`);
  const article = parseFrontMatter(await read(`src/content/blog/${name}`), name);
  if (!/^[a-z0-9-]+$/.test(article.meta.slug || '')) throw new Error(`${name} has an unsafe slug`);
  const canonical = `${origin}/${lang}/blog/${article.meta.slug}/`;
  if (article.meta.canonical !== canonical) throw new Error(`${name} canonical must be ${canonical}`);
  if (publishedArticle(article.meta)) {
    if (!article.meta.datePublished || article.meta.datePublished === article.meta.draftedAt) throw new Error(`${name} needs a publication time distinct from draftedAt`);
    if (article.meta.author) throw new Error(`${name} must not name an author`);
  }
  blogArticles.push({lang, file: name, ...article});
}
function blogChrome(base) {
  return html => render(html, base).replace(/href="#(.*?)"/g, `href="${base.homePath}#$1"`);
}
function imageDimensions(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xFF) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        return {width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5)};
      }
      if (marker === 0xD8 || marker === 0xD9 || marker === 0x01) { offset += 2; continue; }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buffer.subarray(0, 8).equals(png)) return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
  throw new Error('Could not read image dimensions');
}
const languagesBySlug = new Map();
for (const article of blogArticles) {
  const languages = languagesBySlug.get(article.meta.slug) || new Set();
  languages.add(article.lang);
  languagesBySlug.set(article.meta.slug, languages);
}
function byPublication(a, b) {
  return String(a.meta.datePublished || '9999').localeCompare(String(b.meta.datePublished || '9999')) || a.file.localeCompare(b.file);
}
for (const lang of ['zh', 'en']) {
  const indexCopy = blogIndexCopy[lang];
  const items = blogArticles.filter(article => article.lang === lang);
  const published = items.filter(article => publishedArticle(article.meta));
  const visible = (published.length ? published : items).slice().sort(byPublication);
  const indexable = published.length > 0 && visible.every(article => publishedArticle(article.meta));
  const base = contextFor(lang, 'blog');
  const chrome = blogChrome(base);
  const cards = visible.map(article => {
    const draft = !publishedArticle(article.meta);
    const href = `/${lang}/blog/${article.meta.slug}/`;
    const date = !draft && article.meta.datePublished ? `<p class="blog-dates">${escape(indexCopy.publishedLabel)} <time datetime="${escape(article.meta.datePublished)}">${escape(article.meta.datePublished)}</time></p>` : '';
    return `<article class="blog-card"><h2><a href="${href}">${escape(article.meta.title)}</a></h2><p>${escape(article.meta.excerpt)}</p>${date}<a class="section-link" href="${href}">${escape(indexCopy.read)}</a>${draft ? `<p class="blog-draft-banner" role="note">${escape(indexCopy.draftBanner)}</p>` : ''}</article>`;
  }).join('');
  const indexBody = `<a class="skip" href="#main">${escape(base.skip)}</a>
${chrome(templates.header)}
<main id="main" class="wrap guide-page blog-page" data-editorial-index="${indexable ? 'public' : 'draft'}">
  ${indexable ? '' : `<p class="blog-draft-banner" role="note">${escape(indexCopy.draftBanner)}</p>`}
  <nav class="guide-breadcrumb" aria-label="${escape(base.breadcrumbLabel)}"><a href="${base.homePath}">${escape(base.breadcrumbHome)}</a><span aria-hidden="true">›</span><span aria-current="page">${escape(indexCopy.heading)}</span></nav>
  <header class="guide-heading"><h1>${escape(indexCopy.heading)}</h1><p class="guide-intro">${escape(indexCopy.intro)}</p></header>
  <div class="blog-list">${cards}</div>
</main>
${chrome(templates.footer)}`;
  const indexContext = {...base, pageTitle: indexCopy.pageTitle, pageDescription: indexCopy.description};
  const indexDirectory = path.join(root, `public/${lang}/blog`);
  await mkdir(indexDirectory, {recursive: true});
  await writeFile(path.join(indexDirectory, 'index.html'), document(indexContext, indexBody, false, 'blog', {
    kind: 'guide',
    robots: indexable ? undefined : 'noindex, nofollow',
    breadcrumb: [
      {name: base.breadcrumbHome, url: `${origin}${base.homePath}`},
      {name: indexCopy.heading, url: base.canonical}
    ]
  }));
  for (const article of items) {
    const draft = !publishedArticle(article.meta);
    const articleBase = contextFor(lang, `blog/${article.meta.slug}`);
    const available = languagesBySlug.get(article.meta.slug);
    if (available.size < 2) {
      if (!(available.size === 1 && available.has('zh') && lang === 'zh')) {
        throw new Error(`${article.file} has no translated page, and an invented translation must not be generated`);
      }
      articleBase.enPath = '/en/blog/';
      articleBase.enLinkAttrs = ' data-language-fallback="blog-index" title="这篇只有中文" aria-label="这篇只有中文，前往英文指南列表"';
      articleBase.alternateLocale = '';
      articleBase.monolingual = 'zh';
    }
    const rendered = renderMarkdown(article.markdown, {
      resolveImage: filename => {
        const imageFile = path.join(root, 'public', lang, 'blog', article.meta.slug, filename);
        let buffer;
        try { buffer = readFileSync(imageFile); }
        catch { throw new Error(`${article.file} references missing image ${filename}`); }
        return {src: `/${lang}/blog/${article.meta.slug}/${filename}`, ...imageDimensions(buffer)};
      }
    });
    const articleChrome = blogChrome(articleBase);
    const toc = rendered.toc.length ? `<nav class="guide-contents" aria-label="${escape(indexCopy.contentsLabel)}"><span>${escape(indexCopy.contentsLabel)}</span><ul>${rendered.toc.map(item => `<li><a href="#${item.id}">${item.text}</a></li>`).join('')}</ul></nav>` : '';
    const dates = !draft && article.meta.datePublished ? `<p class="blog-dates">${escape(indexCopy.publishedLabel)} <time datetime="${escape(article.meta.datePublished)}">${escape(article.meta.datePublished)}</time>${article.meta.dateModified ? ` · ${escape(indexCopy.updatedLabel)} <time datetime="${escape(article.meta.dateModified)}">${escape(article.meta.dateModified)}</time>` : ''}</p>` : '';
    const articleBody = `<a class="skip" href="#main">${escape(articleBase.skip)}</a>
${articleChrome(templates.header)}
<main id="main" class="wrap guide-page blog-page" data-content-status="${escape(article.meta.status)}" data-review-status="${escape(article.meta.reviewStatus || '')}" data-drafted-at="${escape(article.meta.draftedAt || '')}">
  ${draft ? `<p class="blog-draft-banner" role="note">${escape(indexCopy.draftBanner)}</p>` : ''}
  <nav class="guide-breadcrumb" aria-label="${escape(articleBase.breadcrumbLabel)}"><a href="${articleBase.homePath}">${escape(articleBase.breadcrumbHome)}</a><span aria-hidden="true">›</span><a href="${articleBase.blogPath}">${escape(indexCopy.heading)}</a><span aria-hidden="true">›</span><span aria-current="page">${escape(article.meta.title)}</span></nav>
  <article class="blog-article">
    <header class="guide-heading"><h1>${escape(article.meta.title)}</h1><p class="guide-intro">${escape(article.meta.excerpt)}</p>${dates}</header>
    ${toc}
    ${rendered.html}
  </article>
</main>
${articleChrome(templates.footer)}`;
    const directory = path.join(root, `public/${lang}/blog/${article.meta.slug}`);
    await mkdir(directory, {recursive: true});
    await writeFile(path.join(directory, 'index.html'), document({
      ...articleBase, pageTitle: article.meta.seoTitle, pageDescription: article.meta.description
    }, articleBody, false, 'blog', {
      kind: 'guide',
      robots: draft ? 'noindex, nofollow' : undefined,
      ogTitle: article.meta.seoTitle,
      breadcrumb: [
        {name: articleBase.breadcrumbHome, url: `${origin}${articleBase.homePath}`},
        {name: indexCopy.heading, url: `${origin}${articleBase.blogPath}`},
        {name: article.meta.title, url: articleBase.canonical}
      ],
      article: draft ? undefined : {headline: article.meta.title, datePublished: article.meta.datePublished, dateModified: article.meta.dateModified}
    }));
    if (!draft) {
      urls.push(articleBase.canonical);
      lastmod.set(articleBase.canonical, article.meta.datePublished);
    }
  }
  if (indexable) {
    urls.push(base.canonical);
    const publishedAt = published.map(item => item.meta.datePublished).filter(Boolean).sort().at(-1);
    if (publishedAt) lastmod.set(base.canonical, publishedAt);
  }
}
function microphoneVisual(copy) {
  return `<p class="device-prompt">${escape(copy.say)}</p><div class="device-meter" id="device-meter" hidden><p class="device-meter-name" id="device-meter-name">${escape(copy.meter_label)}</p><div class="device-meter-track" aria-hidden="true"><span id="device-meter-bar"></span></div></div><p class="tool-help">${escape(copy.meter_note)}</p><p class="tool-help">${escape(copy.no_playback)}</p>`;
}
function cameraVisual(copy) {
  return `<div class="device-preview-frame"><video id="device-video" hidden muted playsinline aria-label="${escape(copy.preview_label)}"></video><p id="device-preview-empty">${escape(copy.preview_empty)}</p></div><button type="button" class="button" id="device-play" hidden>${escape(copy.tap_preview)}</button><label class="device-mirror"><input id="device-mirror" type="checkbox"> ${escape(copy.mirror)}</label><p class="tool-help">${escape(copy.mirror_note)}</p><p id="device-resolution" class="tool-help" hidden></p><p class="tool-help">${escape(copy.resolution_note)}</p><p class="tool-help">${escape(copy.framing_tip)}</p>`;
}
for (const kind of ['microphone', 'camera']) {
  for (const lang of ['zh', 'en']) {
    const copy = deviceCopy(lang, kind);
    const slug = kind === 'microphone' ? 'tools/microphone-test' : 'tools/camera-test';
    const base = contextFor(lang, slug);
    const chrome = html => render(html, base).replace(/href="#(.*?)"/g, `href="${base.homePath}#$1"`);
    const runtime = Object.fromEntries(Object.entries(copy).filter(([, value]) => typeof value === 'string'));
    const context = {
      ...base, ...copy, pageTitle: copy.pageTitle, pageDescription: copy.pageDescription, pageName: copy.heading,
      deviceKind: kind, deviceVisual: kind === 'microphone' ? microphoneVisual(copy) : cameraVisual(copy),
      otherPath: `/${lang}/tools/${copy.otherSlug}/`,
      faqHtml: copy.faqs.map(([question, answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join('\n'),
      runtimeCopy: JSON.stringify(runtime).replace(/</g, '\\u003c'),
      siteHeader: chrome(templates.header), siteFooter: chrome(templates.footer)
    };
    const directory = path.join(root, `public/${lang}/${slug}`);
    await mkdir(directory, {recursive: true});
    await writeFile(path.join(directory, 'index.html'), document(context, render(templates['device-tool'], context), false, 'device', {
      kind: 'tool', ogTitle: copy.ogTitle,
      breadcrumb: [
        {name: base.breadcrumbHome, url: `${origin}${base.homePath}`},
        {name: copy.toolsLabel, url: `${origin}${base.homePath}#tools`},
        {name: copy.heading, url: base.canonical}
      ]
    }));
    urls.push(base.canonical);
    lastmod.set(base.canonical, '2026-11-23');
  }
}
await writeFile(path.join(root,'public/sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${url}</loc>${lastmod.has(url) ? `<lastmod>${lastmod.get(url)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
console.log(`Built localized pages and sitemap with ${urls.length} URLs.`);
