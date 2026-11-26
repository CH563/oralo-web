import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createReadStream} from 'node:fs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const publicDir = path.join(root, 'public');
const chromePath = ['/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'].find(candidate => {
  try { return statSync(candidate).isFile(); }
  catch { return false; }
});

function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const relative = decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(publicDir, relative));
    if (!file.startsWith(publicDir)) {
      response.writeHead(403).end();
      return;
    }
    const target = statOrNull(file)?.isDirectory() ? path.join(file, 'index.html') : file;
    if (!target || !target.startsWith(publicDir) || !statOrNull(target)?.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {'content-type': contentType(target)});
    createReadStream(target).pipe(response);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function statOrNull(file) {
  try { return statSync(file); }
  catch { return null; }
}

function contentType(file) {
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.jpg')) return 'image/jpeg';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.webp')) return 'image/webp';
  return 'text/html; charset=utf-8';
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const {port} = probe.address();
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function launchChrome(port, profile) {
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-extensions', 'about:blank'
  ], {stdio: 'ignore'});
  const started = Date.now();
  let version;
  while (Date.now() - started < 10000) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      if (chrome.exitCode != null) throw new Error(`Chrome exited ${chrome.exitCode}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!version) throw new Error('Chrome DevTools did not start');
  return chrome;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let sequence = 0;
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once: true});
    ws.addEventListener('error', () => reject(new Error('DevTools socket failed')), {once: true});
  });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const {resolve, reject} = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  return {
    ready: opened,
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject});
        ws.send(JSON.stringify({id, method, params}));
      });
    },
    close() { ws.close(); }
  };
}

async function openPage(port, url) {
  const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {method: 'PUT'})).json();
  const page = connect(created.webSocketDebuggerUrl);
  await page.ready;
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.navigate', {url});
  const started = Date.now();
  let ready = false;
  while (Date.now() - started < 10000) {
    const state = await page.send('Runtime.evaluate', {expression: 'document.readyState', returnByValue: true});
    if (state.result.value === 'complete' && await hasToc(page)) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error(`Page did not finish loading: ${url}`);
  return page;
}

async function hasToc(page) {
  const result = await page.send('Runtime.evaluate', {
    expression: 'Boolean(document.querySelector(".blog-toc button, .blog-list"))',
    returnByValue: true
  });
  return result.result.value === true;
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Page evaluation failed');
  return result.result.value;
}

async function setViewport(page, width, height) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 700
  });
  await evaluate(page, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}

test('on-camera pages keep the reading column inside 390px and open the 1700px contents list beside it', {timeout: 90000}, async () => {
  assert.ok(chromePath, 'Chrome is required for the viewport check');
  const server = await startServer();
  const profile = mkdtempSync(path.join(tmpdir(), 'oralo-chrome-'));
  const port = await freePort();
  const chrome = await launchChrome(port, profile);
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/zh/blog/on-camera-update/', '/en/blog/on-camera-update/', '/zh/blog/', '/en/blog/']) {
      const page = await openPage(port, `${origin}${route}`);
      try {
        await setViewport(page, 390, 844);
        const narrow = await evaluate(page, `(() => {
          const doc = document.documentElement;
          const overflow = [];
          for (const node of document.querySelectorAll('body *')) {
            const rect = node.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.right > doc.clientWidth + 1 || rect.left < -1) {
              overflow.push({tag: node.tagName, className: String(node.className).slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right)});
              if (overflow.length === 5) break;
            }
          }
          const toc = document.querySelector('.blog-toc');
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            overflow,
            tocDisplay: toc ? getComputedStyle(toc).display : 'absent',
            drawer: Boolean(document.querySelector('.blog-toc-drawer, .blog-toc-backdrop'))
          };
        })()`);
        assert.equal(narrow.scrollWidth <= narrow.clientWidth + 1, true, `${route} ${JSON.stringify(narrow)}`);
        assert.deepEqual(narrow.overflow, [], route);
        assert.equal(narrow.drawer, false, route);
        if (route.includes('on-camera-update')) {
          assert.equal(narrow.tocDisplay, 'none', route);
          await evaluate(page, 'document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, document.body.scrollHeight)');
          await evaluate(page, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          const scrolled = await evaluate(page, '({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth})');
          assert.equal(scrolled.scrollWidth <= scrolled.clientWidth + 1, true, `${route} bottom ${JSON.stringify(scrolled)}`);
        }
      } finally {
        page.close();
      }
    }

    for (const lang of ['zh', 'en']) {
      const page = await openPage(port, `${origin}/${lang}/blog/on-camera-update/`);
      try {
        await setViewport(page, 1699, 900);
        assert.equal(await evaluate(page, 'getComputedStyle(document.querySelector(".blog-toc")).display'), 'none');
        await setViewport(page, 1700, 900);
        const closed = await evaluate(page, `(() => {
          document.documentElement.style.scrollBehavior = 'auto';
          window.scrollTo(0, 0);
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            resolve(document.querySelector('.blog-toc button').getAttribute('aria-expanded'));
          })));
        })()`);
        assert.equal(closed, 'false', lang);
        const opened = await evaluate(page, `(() => {
          window.scrollTo(0, 180);
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            const article = document.querySelector('.blog-article').getBoundingClientRect();
            const toc = document.querySelector('.blog-toc').getBoundingClientRect();
            const panel = document.querySelector('#blog-toc-panel').getBoundingClientRect();
            resolve({
              expanded: document.querySelector('.blog-toc button').getAttribute('aria-expanded'),
              articleLeft: article.left,
              tocRight: Math.max(toc.right, panel.right),
              articleWidth: article.width
            });
          })));
        })()`);
        assert.equal(opened.expanded, 'true', lang);
        assert.equal(opened.tocRight < opened.articleLeft, true, `${lang} ${JSON.stringify(opened)}`);
        assert.equal(opened.articleWidth >= 1100, true, `${lang} article column ${opened.articleWidth}`);
        const current = await evaluate(page, `(() => {
          document.documentElement.style.scrollBehavior = 'auto';
          const heading = document.querySelectorAll('.blog-article h2')[2];
          window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 40);
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            const link = document.querySelector('.blog-toc a[aria-current="location"]');
            resolve({href: link ? link.getAttribute('href') : '', id: heading.id, count: document.querySelectorAll('.blog-toc a[aria-current="location"]').length});
          })));
        })()`);
        assert.equal(current.count, 1, lang);
        assert.equal(current.href, `#${current.id}`, lang);
        const dismissed = await evaluate(page, `(() => {
          document.documentElement.style.scrollBehavior = 'auto';
          document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
          const afterEscape = document.querySelector('.blog-toc button').getAttribute('aria-expanded');
          window.scrollTo(0, 700);
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            const stillClosed = document.querySelector('.blog-toc button').getAttribute('aria-expanded');
            window.scrollTo(0, 0);
            requestAnimationFrame(() => requestAnimationFrame(() => {
              window.scrollTo(0, 180);
              requestAnimationFrame(() => requestAnimationFrame(() => {
                resolve({
                  afterEscape,
                  stillClosed,
                  focused: document.activeElement === document.querySelector('.blog-toc button'),
                  reopened: document.querySelector('.blog-toc button').getAttribute('aria-expanded')
                });
              }));
            }));
          })));
        })()`);
        assert.equal(dismissed.afterEscape, 'false', lang);
        assert.equal(dismissed.stillClosed, 'false', lang);
        assert.equal(dismissed.focused, true, lang);
        assert.equal(dismissed.reopened, 'true', lang);
      } finally {
        page.close();
      }
    }
  } finally {
    chrome.kill();
    await new Promise(resolve => server.close(resolve));
    rmSync(profile, {recursive: true, force: true});
  }
});
