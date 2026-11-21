import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFile(path.join(root, name), 'utf8');
const locales = Object.fromEntries(await Promise.all(['zh', 'en'].map(async lang => [lang, JSON.parse(await read(`src/content/${lang}.json`))])));
const guides = JSON.parse(await read('src/content/guides.json'));
const templates = Object.fromEntries(await Promise.all(['home', 'header', 'footer', 'floating'].map(async name => [name, await read(`src/templates/${name}.html`)])));
const origin = 'https://oralo.fun';
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
  return {...locales[lang], language:lang, htmlLang:lang === 'zh' ? 'zh-Hans' : 'en',
    homePath:`/${lang}/`, voicePath:`/${lang}/voice-following/`, floatingPath:`/${lang}/floating-prompt/`,
    enPath:`/en/${suffix}`, zhPath:`/zh/${suffix}`, enCurrent:lang === 'en' ? 'page' : 'false', zhCurrent:lang === 'zh' ? 'page' : 'false',
    canonical:`${origin}/${lang}/${suffix}`, ogLocale:lang === 'zh' ? 'zh_CN' : 'en_US', alternateLocale:lang === 'zh' ? 'en_US' : 'zh_CN'};
}
function document(context, body, home) {
  const c = Object.fromEntries(Object.entries(context).map(([k,v])=>[k,escape(v)]));
  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#faf9f5">
  <title>${c.pageTitle}</title>
  <meta name="description" content="${c.pageDescription}">
  <link rel="canonical" href="${c.canonical}">
  <link rel="alternate" hreflang="zh-Hans" href="${origin}${c.zhPath}">
  <link rel="alternate" hreflang="en" href="${origin}${c.enPath}">
  <link rel="alternate" hreflang="x-default" href="${origin}${c.enPath}">
  <meta property="og:type" content="website"><meta property="og:site_name" content="Oralo">
  <meta property="og:url" content="${c.canonical}"><meta property="og:locale" content="${c.ogLocale}"><meta property="og:locale:alternate" content="${c.alternateLocale}">
  <meta property="og:title" content="${c.pageTitle}"><meta property="og:description" content="${c.pageDescription}">
  <meta property="og:image" content="${origin}/assets/oralo-social-v1.jpg"><meta property="og:image:secure_url" content="${origin}/assets/oralo-social-v1.jpg">
  <meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${c.socialAlt}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${c.pageTitle}"><meta name="twitter:description" content="${c.pageDescription}">
  <meta name="twitter:image" content="${origin}/assets/oralo-social-v1.jpg"><meta name="twitter:image:alt" content="${c.socialAlt}">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">${home ? '' : '<link rel="stylesheet" href="/guides.css">'}
  <script src="/navigation.js" defer></script>
  ${home ? '<script src="/translations.js" defer></script><script src="/app.js" defer></script><script src="/mirror-demo.js" defer></script>' : ''}
</head>
<body>${body}</body>
</html>
`;
}
const sectionTitles = {
  'voice-following': {en:['Keep pace with your script','Find a way back','What affects recognition','Using Oralo offline'],zh:['跟着讲稿，标出位置','离稿之后，怎样接回','哪些因素会影响识别','离线时，哪些功能可用']},
  'floating-prompt': {en:['Set a steady pace','Start voice following in Oralo','If the microphone is interrupted','Keep your reading hints close','Compatibility and tested scope'],zh:['设定速度，从容开始','先在 Oralo 启动语音跟随','麦克风被中断时','把读音提示一起带上','兼容范围与已测试场景']}
};
function guideBody(lang, slug, c) {
  const page = guides[slug][lang];
  const floating = slug === 'floating-prompt';
  const groups = floating ? [[1],[2],[3],[4],[5]] : [[1],[2,3],[4],[5]];
  const articles = groups.map((indexes,i)=>`<section class="guide-block"><h2>${escape(sectionTitles[slug][lang][i])}</h2>${indexes.map(index=>`<p>${escape(page.paragraphs[index])}</p>`).join('')}</section>`).join('\n');
  const visual = floating ? render(templates.floating,c) : `<figure class="guide-reader"><a class="screenshot-link" href="/assets/app-reader-640.webp" target="_blank" rel="noopener"><img src="/assets/app-reader-320.webp" srcset="/assets/app-reader-320.webp 320w, /assets/app-reader-640.webp 640w" sizes="260px" width="1206" height="2622" loading="lazy" decoding="async" alt="${escape(c.recoveryAlt)}"></a><figcaption class="screenshot-note">${escape(c.concept)}</figcaption></figure>`;
  const otherPath = floating ? c.voicePath : c.floatingPath;
  const otherLabel = floating ? c.voiceLearn : c.floatingLearn;
  const chrome = html => render(html,c).replace(/href="#(.*?)"/g,`href="${c.homePath}#$1"`);
  return `
<a class="skip" href="#main">${escape(c.skip)}</a>
${chrome(templates.header)}
<main id="main" class="wrap guide-page">
  <div class="guide-heading"><a class="guide-back" href="${c.homePath}">← ${escape(c.backHome)}</a><span class="kicker">${escape(floating?c.guideFloatingKicker:c.guideVoiceKicker)}</span><h1>${escape(page.fields.H1)}</h1><p class="guide-intro">${escape(page.paragraphs[0])}</p></div>
  <div class="guide-layout"><article class="guide-article">${articles}${floating?'':`<p class="guide-note">${escape(page.fields[lang==='zh'?'演示说明（若首页示意仍保留）':'Demo note (if the existing preview remains)'])}</p>`}</article><aside class="guide-visual">${visual}<a class="section-link" href="${otherPath}">${escape(otherLabel)} ↗</a></aside></div>
  <section id="faq" class="guide-faq"><h2>${escape(c.guideFaqTitle)}</h2><div class="faq-list">${page.faqs.map(([q,a])=>`<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n')}</div></section>
  <section class="guide-cta"><span class="kicker">${escape(c.guideRelated)}</span><h2>${escape(c.guideCtaTitle)}</h2><a class="button" href="${c.homePath}#waitlist">${escape(c.join)} <span aria-hidden="true">↗</span></a><p>${escape(c.guideCtaNote)}</p><a class="section-link" href="${otherPath}">${escape(otherLabel)}</a></section>
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
await writeFile(path.join(root,'public/translations.js'),`// Generated by scripts/build-site.mjs from src/content/.\nconst translations = ${JSON.stringify(locales)};\n`);
await writeFile(path.join(root,'public/index.html'),'<!doctype html>\n<html lang="zh-Hans"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=/zh/"><title>Oralo</title><link rel="canonical" href="https://oralo.fun/zh/"></head><body><a href="/zh/">Oralo</a></body></html>\n');
urls.push(`${origin}/privacy/`,`${origin}/support/`);
await writeFile(path.join(root,'public/sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`Built 6 localized pages and sitemap with ${urls.length} URLs.`);
