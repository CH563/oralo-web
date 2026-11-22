import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFile(path.join(root, name), 'utf8');
const locales = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/${lang}.json`))])));
const guides = JSON.parse(await read('src/content/guides.json'));
const tools = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/speech-length-${lang}.json`))])));
const previews = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/speech-preview-${lang}.json`))])));
const templates = Object.fromEntries(await Promise.all(['home', 'header', 'footer', 'floating', 'speech-length', 'speech-preview'].map(async name => [name, await read(`src/templates/${name}.html`)])));
const origin = 'https://oralo.fun';
const appStoreUrl = 'https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605';
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
  return {...locales[lang], appStoreUrl, language:lang, htmlLang:lang === 'zh' ? 'zh-Hans' : 'en',
    homePath:`/${lang}/`, voicePath:`/${lang}/voice-following/`, floatingPath:`/${lang}/floating-prompt/`, toolPath:`/${lang}/tools/speech-length/`, previewPath:`/${lang}/tools/speech-preview/`,
    enPath:`/en/${suffix}`, zhPath:`/zh/${suffix}`, enCurrent:lang === 'en' ? 'page' : 'false', zhCurrent:lang === 'zh' ? 'page' : 'false',
    canonical:`${origin}/${lang}/${suffix}`, ogLocale:lang === 'zh' ? 'zh_CN' : 'en_US', alternateLocale:lang === 'zh' ? 'en_US' : 'zh_CN'};
}
function document(context, body, home, tool = false) {
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
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">${tool ? '<link rel="stylesheet" href="/tools/speech-length.css">' : home ? '' : '<link rel="stylesheet" href="/guides.css">'}
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
  reader: { widths: [320, 640], width: 1206, height: 2622 },
  floating: { widths: [480, 960], width: 960, height: 1393 }
};
function guideImage({asset, alt, caption}) {
  const {widths, width, height} = guideImages[asset];
  const source = size => `/assets/app-${asset}-${size}.webp`;
  const wide = asset === 'floating';
  return `<figure class="guide-capture${wide ? ' guide-capture-wide' : ''}"><a href="${source(widths[1])}" target="_blank" rel="noopener"><img src="${source(widths[0])}" srcset="${widths.map(size => `${source(size)} ${size}w`).join(', ')}" sizes="${wide ? '(max-width: 700px) calc(100vw - 48px), 380px' : '(max-width: 700px) 220px, 250px'}" width="${width}" height="${height}" loading="lazy" decoding="async" alt="${escape(alt)}"></a><figcaption>${escape(caption)}</figcaption></figure>`;
}
function guideSection(section) {
  const entries = (items, ordered) => `<${ordered ? 'ol class="guide-steps"' : 'ul class="guide-checks"'}>${items.map(item => `<li><h3>${escape(item.title)}</h3><p>${escape(item.text)}</p></li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
  const evidence = section.evidence;
  return `<section id="${escape(section.id)}" class="guide-block${section.image ? ' guide-block-illustrated' : ''}" aria-labelledby="${escape(section.id)}-title"><div class="guide-copy"><h2 id="${escape(section.id)}-title">${escape(section.title)}</h2>
    ${section.intro ? `<p class="guide-section-intro">${escape(section.intro)}</p>` : ''}
    ${section.steps ? entries(section.steps, true) : ''}${section.items ? entries(section.items, false) : ''}
    ${evidence ? `<div class="guide-evidence"><table><caption>${escape(section.title)}</caption><thead><tr>${evidence.headers.map(label => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead><tbody>${evidence.rows.map(row => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${escape(cell)}</th>` : `<td><span class="guide-evidence-label" aria-hidden="true">${escape(evidence.headers[index])}</span>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    ${section.note ? `<p class="guide-note">${escape(section.note)}</p>` : ''}
  </div>${section.image ? guideImage(section.image) : ''}</section>`;
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
  <div class="guide-heading"><a class="guide-back" href="${c.homePath}">← ${escape(c.backHome)}</a><span class="kicker">${escape(guide.label)}</span><h1>${escape(page.fields.H1)}</h1><p class="guide-intro">${escape(page.paragraphs[0])}</p><div class="guide-actions">${badge}<a class="section-link" href="#prepare">${escape(guide.startLabel)} ↓</a></div></div>
  <nav class="guide-contents" aria-label="${escape(guide.contentsLabel)}"><span>${escape(guide.contentsLabel)}</span><ul>${guide.sections.map(section => `<li><a href="#${escape(section.id)}">${escape(section.title)}</a></li>`).join('')}</ul></nav>
  <article class="guide-article">${guide.sections.map(guideSection).join('\n')}</article>
  <section id="faq" class="guide-faq"><h2>${escape(c.guideFaqTitle)}</h2><div class="faq-list">${page.faqs.map(([q,a])=>`<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n')}</div></section>
  <section class="guide-cta"><span class="kicker">${escape(c.guideRelated)}</span><h2>${escape(c.guideCtaTitle)}</h2>${badge}<p>${escape(c.guideCtaNote)}</p><a class="section-link" href="${otherPath}">${escape(otherLabel)} ↗</a></section>
</main>
${chrome(templates.footer)}
`;
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
urls.push(`${origin}/privacy/`,`${origin}/support/`);
await writeFile(path.join(root,'public/sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`Built 10 localized pages and sitemap with ${urls.length} URLs.`);
