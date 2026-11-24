const toc = document.querySelector('.blog-toc');
if (toc) {
  const button = toc.querySelector('button');
  const panel = toc.querySelector('.guide-contents');
  const setOpen = open => {
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
  };
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || button.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    button.focus();
  });
}
