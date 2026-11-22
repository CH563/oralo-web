import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { origin, structuredData, structuredDataScript } from './structured-data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFile(path.join(root, name), 'utf8');
const locales = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/${lang}.json`))])));
const guides = JSON.parse(await read('src/content/guides.json'));
const englishScreenshots = JSON.parse(await read('src/content/english-screenshots.json'));
const samples = JSON.parse(await read('src/content/guide-samples.json'));
const downloads = JSON.parse(await read('src/content/download.json'));
const tools = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/speech-length-${lang}.json`))])));
const previews = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/speech-preview-${lang}.json`))])));
const templates = Object.fromEntries(await Promise.all(['home', 'header', 'footer', 'floating', 'speech-length', 'speech-preview'].map(async name => [name, await read(`src/templates/${name}.html`)])));
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
  return {...locales[lang], imageSuffix: lang === 'en' ? '-en' : '', ipadWidth: lang === 'en' ? englishScreenshots.screenshots.ipad.width : 2420, ipadHeight: lang === 'en' ? englishScreenshots.screenshots.ipad.height : 1668, mirrorHeight: lang === 'en' ? 1566 : 960, desktopDownload: desktopDownload(lang), desktopDownloadJump: lang === 'en' ? 'Scan QR code or copy link' : '扫码或复制下载链接', appStoreUrl, developerName:product.developer.name, developerUrl:product.developer.url, slug, language:lang, htmlLang:lang === 'zh' ? 'zh-Hans' : 'en',
    homePath:`/${lang}/`, voicePath:`/${lang}/voice-following/`, floatingPath:`/${lang}/floating-prompt/`, toolPath:`/${lang}/tools/speech-length/`, previewPath:`/${lang}/tools/speech-preview/`,
    enPath:`/en/${suffix}`, zhPath:`/zh/${suffix}`, enCurrent:lang === 'en' ? 'page' : 'false', zhCurrent:lang === 'zh' ? 'page' : 'false',
    canonical:`${origin}/${lang}/${suffix}`, ogLocale:lang === 'zh' ? 'zh_CN' : 'en_US', alternateLocale:lang === 'zh' ? 'en_US' : 'zh_CN'};
}
function document(context, body, home, tool = false) {
  const schema = structuredData({
    canonical: context.canonical, title: context.pageTitle, description: context.pageDescription,
    language: context.htmlLang, kind: home ? 'home' : tool ? 'tool' : 'guide', product, copy: context,
    breadcrumb: home ? undefined : [
      {name: context.breadcrumbHome, url: `${origin}${context.homePath}`},
      {name: tool ? context.pageName : guides[context.slug][context.language].fields.H1, url: context.canonical}
    ]
  });
  const c = Object.fromEntries(Object.entries(context).map(([k,v])=>[k,escape(v)]));
  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#faf9f5">
  <meta name="apple-itunes-app" content="app-id=6835449605">
  <title>${c.pageTitle}</title>
  <meta name="description" content="${c.pageDescription}">
  <link rel="canonical" href="${c.canonical}">
  <link rel="alternate" hreflang="zh-Hans" href="${origin}${c.zhPath}">
  <link rel="alternate" hreflang="en" href="${origin}${c.enPath}">
  <link rel="alternate" hreflang="x-default" href="${origin}${c.enPath}">
  <meta property="og:type" content="website"><meta property="og:site_name" content="Oralo">
  <meta property="og:url" content="${c.canonical}"><meta property="og:locale" content="${c.ogLocale}"><meta property="og:locale:alternate" content="${c.alternateLocale}">
  <meta property="og:title" content="${c.pageTitle}"><meta property="og:description" content="${c.pageDescription}">
  <meta property="og:image" content="${origin}/assets/oralo-social-v1.jpg?v=20261122-badges"><meta property="og:image:secure_url" content="${origin}/assets/oralo-social-v1.jpg?v=20261122-badges">
  <meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${c.socialAlt}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${c.pageTitle}"><meta name="twitter:description" content="${c.pageDescription}">
  <meta name="twitter:image" content="${origin}/assets/oralo-social-v1.jpg?v=20261122-badges"><meta name="twitter:image:alt" content="${c.socialAlt}">
  ${structuredDataScript(schema)}
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/download.css"><script type="module" src="/download.js"></script>${tool ? '<link rel="stylesheet" href="/tools/speech-length.css">' : home ? '' : '<link rel="stylesheet" href="/guides.css">'}
  ${tool === 'preview' ? '<link rel="stylesheet" href="/tools/speech-preview.css"><script type="module" src="/tools/speech-preview.js"></script>' : tool ? '<script type="module" src="/tools/speech-tool.js"></script>' : '<script src="/navigation.js" defer></script>'}
  ${home ? '<script src="/translations.js" defer></script><script src="/app.js" defer></script><script src="/mirror-demo.js" defer></script>' : ''}
</head>
<body>${body}</body>
</html>
`.replace(/[ \t]+$/gm, '');
}
const guideImages = {
  library: { widths: [320, 640], width: 1206, height: 2622 },
  prepare: { widths: [320, 640], width: 1206, height: 2622 },
  readiness: { widths: [320, 640], width: 1206, height: 2622 },
  'floating-controls': { widths: [320, 640], width: 1206, height: 2622 },
  reader: { widths: [320, 640], width: 1206, height: 2622 },
  floating: { widths: [480, 960], width: 960, height: 1393 }
};
function guideImage({asset, alt, caption, source: provenance}, lang) {
  const {widths, width, height} = lang === 'en' ? englishScreenshots.screenshots[asset] : guideImages[asset];
  const source = size => `/assets/app-${asset}${lang === 'en' ? '-en' : ''}-${size}.webp`;
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
for (const lang of ['zh','en']) {
  const c=contextFor(lang);
  await mkdir(path.join(root,`public/${lang}`),{recursive:true});
  await writeFile(path.join(root,`public/${lang}/index.html`),document(c,render(templates.home,c),true));
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
  const html = (await read(file)).replace(/\n?<script id="site-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)[1];
  const alternateName = html.match(/data-zh-title="([^"]+)"/)[1];
  const schema = structuredData({canonical: `${origin}/${slug}/`, title, description,
    language: ['en', 'zh-Hans'], kind: slug, alternateName});
  await writeFile(path.join(root, file), html.replace('</head>', `\n${structuredDataScript(schema)}</head>`));
  urls.push(`${origin}/${slug}/`);
}
await writeFile(path.join(root,'public/sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`Built 10 localized pages and sitemap with ${urls.length} URLs.`);
