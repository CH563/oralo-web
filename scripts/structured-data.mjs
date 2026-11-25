// JSON-LD is built into the initial HTML; no browser request or runtime is needed.
export const origin = 'https://oralo.fun';
export const websiteId = `${origin}/#website`;
export const applicationId = `${origin}/#app`;
export const developerId = `${origin}/#developer`;

export function structuredData({canonical, title, description, language, kind, product, copy, breadcrumb, alternateName, article}) {
  const page = {
    '@type': kind === 'support' ? 'ContactPage' : 'WebPage',
    '@id': `${canonical}#webpage`, url: canonical,
    name: title, description, inLanguage: language,
    isPartOf: {'@id': websiteId}
  };
  if (alternateName) page.alternateName = alternateName;
  const graph = [
    {'@type': 'WebSite', '@id': websiteId, url: `${origin}/`, name: 'Oralo', inLanguage: ['en', 'zh-Hans']},
    page
  ];
  if (kind !== 'tool') page.about = {'@id': applicationId};
  if (kind === 'home') {
    page.mainEntity = {'@id': applicationId};
    graph.push({
      '@type': 'SoftwareApplication', '@id': applicationId,
      name: product.name, url: `${origin}/`,
      identifier: product.appStoreId,
      description: copy.productSummary,
      applicationCategory: product.applicationCategory,
      operatingSystem: product.operatingSystem,
      availableOnDevice: product.devices,
      softwareRequirements: copy.productRequirements,
      installUrl: product.appStoreUrl,
      sameAs: [product.appStoreUrl, product.sourceUrl],
      image: `${origin}/assets/oralo-icon-288.webp`,
      author: {'@id': developerId}
    }, {'@type': 'Person', '@id': developerId, name: product.developer.name, url: product.developer.url});
  }
  if (article) {
    const posting = {
      '@type': 'BlogPosting', '@id': `${canonical}#article`,
      headline: article.headline, description, inLanguage: language,
      datePublished: article.datePublished,
      url: canonical, mainEntityOfPage: {'@id': `${canonical}#webpage`},
      isPartOf: {'@id': websiteId},
      publisher: {'@type': 'Organization', name: 'Oralo', url: origin}
    };
    if (article.dateModified) posting.dateModified = article.dateModified;
    if (article.author) posting.author = article.author;
    page.mainEntity = {'@id': posting['@id']};
    graph.push(posting);
  }
  if (breadcrumb) {
    const id = `${canonical}#breadcrumb`;
    page.breadcrumb = {'@id': id};
    graph.push({
      '@type': 'BreadcrumbList', '@id': id,
      itemListElement: breadcrumb.map(({name, url}, index) => ({'@type': 'ListItem', position: index + 1, name, item: url}))
    });
  }
  return {'@context': 'https://schema.org', '@graph': graph};
}

export function structuredDataScript(data) {
  // A future translated string must not be able to terminate this data block.
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script id="site-structured-data" type="application/ld+json">${json}</script>`;
}
