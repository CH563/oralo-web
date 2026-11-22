import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {structuredDataScript} from '../scripts/structured-data.mjs';
const read = file => readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const origin = 'https://oralo.fun';
const langs = ['en','zh'];
const routes = [...langs.flatMap(lang => ['', 'voice-following/', 'floating-prompt/', 'tools/speech-length/', 'tools/speech-preview/'].map(slug => `/${lang}/${slug}`)), '/privacy/', '/support/'];
const graphFor = route => {
  const html = read(`public${route}index.html`);
  const scripts = [...html.matchAll(/<script id="site-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, `${route}: exactly one JSON-LD block`);
  assert.ok(html.indexOf(scripts[0][0]) < html.indexOf('</head>'), 'available in initial HTML head');
  const data = JSON.parse(scripts[0][1]);
  assert.equal(data['@context'], 'https://schema.org');
  return {html, graph:data['@graph']};
};

test('all canonical pages have one coherent JSON-LD graph with correct language and resolvable entity IDs', () => {
  const definitions = new Set(routes.flatMap(route => graphFor(route).graph.map(node => node['@id'])));
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value['@id']) assert.ok(definitions.has(value['@id']), `unresolved entity: ${value['@id']}`);
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!['offers','price','aggregateRating','review','ratingCount','downloadCount','interactionStatistic'].includes(key), `unsupported claim: ${key}`);
      if (key === '@type') assert.ok(!['FAQPage','HowTo','WebApplication'].includes(child));
      visit(child);
    }
  };
  for (const route of routes) {
    const {html, graph}=graphFor(route);
    assert.equal(new Set(graph.map(node=>node['@id'])).size, graph.length);
    const page=graph.find(node=>node['@id']===`${origin}${route}#webpage`);
    assert.ok(page); assert.equal(page.url, `${origin}${route}`);
    assert.ok(html.includes(`rel="canonical" href="${page.url}"`));
    assert.equal(page['@type'],route==='/support/'?'ContactPage':'WebPage');
    assert.equal(page.isPartOf['@id'], `${origin}/#website`);
    if(route.startsWith('/en/'))assert.equal(page.inLanguage,'en');
    else if(route.startsWith('/zh/'))assert.equal(page.inLanguage,'zh-Hans');
    else assert.deepEqual(page.inLanguage,['en','zh-Hans']);
    const website=graph.find(node=>node['@type']==='WebSite');
    assert.equal(website['@id'], `${origin}/#website`);assert.equal(website.name,'Oralo');
    visit(graph);
  }
});

test('both homepages describe the same App Store product using visible, localized facts', () => {
  const apps=[];
  for(const lang of langs) {
    const {html,graph}=graphFor(`/${lang}/`);
    const copy=JSON.parse(read(`src/content/${lang}.json`));
    const app=graph.find(node=>node['@type']==='SoftwareApplication');apps.push(app);
    assert.equal(app['@id'],`${origin}/#app`);
    assert.equal(app.identifier,'6835449605');
    assert.equal(app.installUrl,'https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605');
    assert.equal(app.description,copy.productSummary);assert.equal(app.softwareRequirements,copy.productRequirements);
    const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
    for(const text of [app.description,app.softwareRequirements,copy.productSystemText,copy.productCategoryText])assert.ok(visible.includes(text));
    assert.ok(visible.includes(`href="${app.installUrl}"`));
    assert.ok(visible.includes(`href="${app.sameAs[1]}"`));
    const author=graph.find(node=>node['@id']===app.author['@id']);
    assert.equal(author['@type'],'Person');assert.ok(visible.includes(author.name));assert.ok(visible.includes(`href="${author.url}"`));
    assert.ok(existsSync(new URL(`../public${new URL(app.image).pathname}`,import.meta.url)));
    assert.deepEqual(app.availableOnDevice,['iPhone','iPad']);
    assert.deepEqual(app.operatingSystem,['iOS 18.0 or later','iPadOS 18.0 or later']);
  }
  for(const field of ['@id','name','identifier','applicationCategory','installUrl','sameAs','author'])assert.deepEqual(apps[0][field],apps[1][field]);
});

test('guides and browser tools have localized breadcrumbs without inventing an intermediate tools page', () => {
  for (const lang of langs) for(const slug of ['voice-following','floating-prompt','tools/speech-length','tools/speech-preview']) {
    const route=`/${lang}/${slug}/`;const {html,graph}=graphFor(route);
    const page=graph.find(node=>node['@type']==='WebPage');
    const crumbs=graph.find(node=>node['@type']==='BreadcrumbList');
    assert.equal(page.breadcrumb['@id'],crumbs['@id']);
    assert.equal(crumbs.itemListElement.length,2);
    assert.deepEqual(crumbs.itemListElement.map(item=>item.position),[1,2]);
    assert.deepEqual(crumbs.itemListElement.map(item=>item.item),[`${origin}/${lang}/`,`${origin}${route}`]);
    const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
    for(const item of crumbs.itemListElement){
      const escaped=item.name.replaceAll('&','&amp;');assert.ok(visible.includes(escaped));
      assert.ok(existsSync(new URL(`../public${new URL(item.item).pathname}index.html`,import.meta.url)));
    }
    if(slug.startsWith('tools/')) {
      assert.equal(page.about,undefined);assert.equal(page.mainEntity,undefined);
      assert.ok(graph.every(node=>!['SoftwareApplication','MobileApplication','WebApplication'].includes(node['@type'])));
    } else assert.equal(page.about['@id'],`${origin}/#app`);
  }
});

test('JSON-LD serialization cannot inject an executable tag from translated or quoted content', () => {
  const payload={name:'</script><script>alert("x")</script>',description:'<b>Words & hints</b>\u2028\u2029'};
  const html=structuredDataScript(payload);
  assert.equal((html.match(/<script\b/g)||[]).length,1);
  assert.equal((html.match(/<\/script>/g)||[]).length,1);
  const content=html.match(/>([\s\S]*)<\/script>/)[1];
  assert.doesNotMatch(content,/[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(content),payload);
});
