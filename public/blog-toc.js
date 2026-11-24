export const TOC_OPEN_AT = 120;
export const TOC_CLOSE_AT = 16;
export const TOC_READING_LINE = 96;

export function nextTocState({scrollY, open, dismissed}) {
  if (scrollY <= TOC_CLOSE_AT) return {open: false, dismissed: false};
  if (dismissed) return {open: false, dismissed: true};
  if (scrollY >= TOC_OPEN_AT) return {open: true, dismissed: false};
  return {open, dismissed};
}

export function currentHeadingIndex(tops, scrollY, line = TOC_READING_LINE, bounds = {}) {
  if (!tops.length) return -1;
  const {scrollHeight, viewportHeight} = bounds;
  const atEnd = scrollHeight != null && viewportHeight != null && scrollY + viewportHeight >= scrollHeight - 4;
  if (atEnd && scrollY > 0 && tops[tops.length - 1] < scrollY + viewportHeight) return tops.length - 1;
  let index = 0;
  const mark = scrollY + line;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= mark) index = i;
  }
  return index;
}

export function panelScrollForLink({scrollTop, panelHeight, linkTop, linkHeight, padding = 8}) {
  const top = Math.max(0, linkTop - padding);
  const bottom = linkTop + linkHeight + padding;
  if (linkHeight + padding * 2 >= panelHeight) return top;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + panelHeight) return Math.max(0, bottom - panelHeight);
  return scrollTop;
}

function install() {
  const toc = document.querySelector('.blog-toc');
  if (!toc) return;
  const button = toc.querySelector('button');
  const panel = toc.querySelector('.guide-contents');
  const links = [...panel.querySelectorAll('a[href^="#"]')];
  const headings = links.map(link => document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1))));
  let open = button.getAttribute('aria-expanded') === 'true';
  let dismissed = false;
  let frame = 0;

  const setOpen = (next, {focusButton = false} = {}) => {
    open = next;
    button.setAttribute('aria-expanded', next ? 'true' : 'false');
    panel.hidden = !next;
    if (focusButton) button.focus();
    if (next) revealCurrent();
  };

  const revealCurrent = () => {
    const scroller = document.scrollingElement;
    const tops = headings.map(heading => heading ? heading.getBoundingClientRect().top + window.scrollY : Infinity);
    const index = currentHeadingIndex(tops, window.scrollY, TOC_READING_LINE, {
      scrollHeight: scroller.scrollHeight,
      viewportHeight: window.innerHeight
    });
    links.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    if (!open || index < 0) return;
    const link = links[index];
    const linkTop = link.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    panel.scrollTop = panelScrollForLink({
      scrollTop: panel.scrollTop,
      panelHeight: panel.clientHeight,
      linkTop,
      linkHeight: link.offsetHeight
    });
  };

  const applyScroll = () => {
    const next = nextTocState({scrollY: window.scrollY, open, dismissed});
    dismissed = next.dismissed;
    if (next.open !== open) setOpen(next.open);
    else revealCurrent();
  };

  button.addEventListener('click', () => {
    if (button.getAttribute('aria-expanded') === 'true') {
      dismissed = true;
      setOpen(false);
    } else {
      dismissed = false;
      setOpen(true);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || button.getAttribute('aria-expanded') !== 'true') return;
    dismissed = true;
    setOpen(false, {focusButton: true});
  });
  window.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      applyScroll();
    });
  }, {passive: true});
  applyScroll();
}

if (typeof document !== 'undefined') install();
