const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function inline(value) {
  const code = [];
  const text = escape(value).replace(/`([^`]+)`/g, (_, content) => `\u0000${code.push(content) - 1}\u0000`);
  const linked = text.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
  const strong = linked.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const emphasis = strong.replace(/(^|[^*])\*([^*]+)\*/g, (_, prefix, content) => `${prefix}<em>${content}</em>`);
  return emphasis.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${code[index]}</code>`);
}

function slug(value, used) {
  const plain = value.replace(/<[^>]+>/g, '');
  const base = plain.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
  let id = base;
  let count = 2;
  while (used.has(id)) id = `${base}-${count++}`;
  used.add(id);
  return id;
}

const imageLine = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const safeImageName = /^[a-z0-9][a-z0-9.-]*\.(?:jpg|jpeg|png|webp)$/;

function renderImage(alt, src, options) {
  if (!safeImageName.test(src)) return `<p>${escape(`![${alt}](${src})`)}</p>`;
  const resolved = options.resolveImage ? options.resolveImage(src) : {src};
  const address = resolved && resolved.src;
  if (!address || /^(?:https?:|javascript:|data:)/i.test(address) || address.includes('..') || address.includes('\\')) {
    return `<p>${escape(`![${alt}](${src})`)}</p>`;
  }
  const width = Number(resolved.width);
  const height = Number(resolved.height);
  const dimensions = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 ? ` width="${width}" height="${height}"` : '';
  return `<figure class="blog-figure"><img src="${escape(address)}" alt="${escape(alt)}"${dimensions} loading="lazy" decoding="async"></figure>`;
}

export function renderMarkdown(markdown, options = {}) {
  const lines = String(markdown).replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').split('\n');
  const used = new Set();
  const toc = [];
  const blocks = [];
  const images = [];
  let index = 0;
  let skippedH1 = false;
  const at = pattern => index < lines.length && pattern.test(lines[index]);
  const structural = line => /^(?:#{1,3}\s+|\||>\s?|[-*]\s+|\d+\.\s+)/.test(line) || imageLine.test(line);
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (!skippedH1 && /^#\s+/.test(line)) { skippedH1 = true; index += 1; continue; }
    if (/^##\s+/.test(line)) {
      const text = inline(line.replace(/^##\s+/, ''));
      const id = slug(text, used);
      toc.push({id, text});
      blocks.push(`<h2 id="${id}">${text}</h2>`);
      index += 1;
      continue;
    }
    if (/^###\s+/.test(line)) {
      blocks.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`);
      index += 1;
      continue;
    }
    if (/^\|/.test(line)) {
      const rows = [];
      while (at(/^\|/)) { rows.push(lines[index]); index += 1; }
      const cells = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => inline(cell.trim()));
      const header = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      blocks.push(`<div class="blog-table"><table><thead><tr>${header.map(cell => `<th scope="col">${cell}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${row.map((cell, cellIndex) => cellIndex === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted = [];
      while (index < lines.length && (/^>\s?/.test(lines[index]) || !lines[index].trim())) {
        if (!lines[index].trim() && (index + 1 >= lines.length || !/^>\s?/.test(lines[index + 1]))) break;
        quoted.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      const paragraphs = quoted.join('\n').split(/\n\s*\n/).filter(part => part.trim());
      blocks.push(`<blockquote>${paragraphs.map(part => `<p>${inline(part.replace(/\n/g, ' ').trim())}</p>`).join('')}</blockquote>`);
      continue;
    }
    const image = line.match(imageLine);
    if (image) {
      if (safeImageName.test(image[2])) images.push(image[2]);
      blocks.push(renderImage(image[1], image[2], options));
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (at(/^[-*]\s+/)) { items.push(inline(lines[index].replace(/^[-*]\s+/, ''))); index += 1; }
      blocks.push(`<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (at(/^\d+\.\s+/)) { items.push(inline(lines[index].replace(/^\d+\.\s+/, ''))); index += 1; }
      blocks.push(`<ol>${items.map(item => `<li>${item}</li>`).join('')}</ol>`);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !structural(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  return {html: blocks.join('\n'), toc, images};
}
