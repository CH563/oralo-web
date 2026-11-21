(() => {
  const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
  try { localStorage.setItem('oralo-language', language); } catch {}
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.delete('lang');
    history.replaceState(null, '', url);
  }
  for (const link of document.querySelectorAll('[data-language-link]')) {
    if (location.hash) link.hash = location.hash;
    link.addEventListener('click', () => { link.hash = location.hash; });
  }
})();
