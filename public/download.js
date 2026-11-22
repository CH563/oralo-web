// This component writes only the published App Store URL after an explicit click.
// It never reads the clipboard or accesses text entered in the online tools.
for (const panel of document.querySelectorAll('[data-download]')) {
  const button = panel.querySelector('[data-copy-download]');
  const link = panel.querySelector('[data-download-link]');
  const status = panel.querySelector('[data-copy-status]');
  const appStoreUrl = link.defaultValue;
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = '';
    try {
      await navigator.clipboard.writeText(appStoreUrl);
      status.textContent = button.dataset.copied;
    } catch {
      link.focus();
      link.select();
      status.textContent = button.dataset.fallback;
    } finally {
      button.disabled = false;
    }
  });
}
