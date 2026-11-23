import {ANALYSIS_SIZE, createDeviceSession} from './device-session.js';

const copy = JSON.parse(document.querySelector('#device-copy').textContent);
const kind = document.querySelector('[data-device-kind]').dataset.deviceKind;
const get = id => document.getElementById(id);
const status = get('device-status');
const live = get('device-live');
const select = get('device-select');
const listNote = get('device-list-note');
const current = get('device-current');
const start = get('device-start');
const stop = get('device-stop');
const cancel = get('device-cancel');
const retry = get('device-retry');
const refresh = get('device-refresh');
const video = get('device-video');
const meter = get('device-meter');
const meterBar = get('device-meter-bar');
const play = get('device-play');
const resolution = get('device-resolution');
const previewEmpty = get('device-preview-empty');
const mirror = get('device-mirror');
const activityKeys = new Set(['receiving', 'activity', 'quiet']);
let lastAnnouncement = '';
let deviceSignature = '';

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] == null ? '' : String(values[name]));
}
function show(element, visible) {
  if (element) element.hidden = !visible;
}
function text(element, value) {
  if (element) element.textContent = value || '';
}

const session = createDeviceSession({
  kind,
  isSecureContext: window.isSecureContext,
  isSupported: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  isEmbedded: window.top !== window.self,
  isVisible: () => document.visibilityState === 'visible',
  getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
  enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
  async createAudioGraph(stream) {
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSIS_SIZE;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let observer = null;
    context.onstatechange = () => { if (observer) observer(context.state); };
    return {
      state: () => context.state,
      resume: () => context.resume(),
      readSamples() { analyser.getFloatTimeDomainData(samples); return samples; },
      observe(fn) { observer = fn; },
      async close() {
        context.onstatechange = null;
        try { source.disconnect(); } catch { /* already disconnected */ }
        try { analyser.disconnect(); } catch { /* already disconnected */ }
        await context.close();
      }
    };
  },
  async attachPreview(stream) {
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play();
    } catch {
      return 'preview_blocked';
    }
    if (video.videoWidth > 0) return 'previewing';
    return new Promise(resolve => {
      const finish = () => resolve(video.videoWidth > 0 ? 'previewing' : 'stream_acquired');
      video.addEventListener('loadeddata', finish, {once: true});
    });
  },
  clearPreview() {
    if (!video) return;
    video.pause();
    video.srcObject = null;
  },
  onChange: render
});

function render(view) {
  const key = activityKeys.has(view.status) ? view.announcement : view.status;
  text(status, copy[key] || copy.unknown);
  status.dataset.state = view.phase;
  if (view.announcement !== lastAnnouncement) {
    lastAnnouncement = view.announcement;
    text(live, copy[view.announcement] || '');
  }
  const showRetry = !view.pending && (view.phase === 'error' || view.phase === 'interrupted');
  const focused = document.activeElement;
  show(start, view.canStart && !showRetry);
  start.disabled = !view.canStart;
  show(stop, view.canStop);
  show(cancel, view.canCancel);
  show(retry, showRetry);
  if (focused && focused.hidden) {
    const next = !stop.hidden ? stop : !retry.hidden ? retry : !start.hidden ? start : status;
    if (next && typeof next.focus === 'function') next.focus();
  }
  refresh.disabled = !view.canRefresh;
  select.disabled = !view.canSelect;
  if (meter) {
    const measurable = typeof view.meter === 'number' && view.phase === 'active';
    show(meter, measurable);
    if (measurable) meterBar.style.transform = `scaleX(${view.meter})`;
  }
  if (video) {
    const showPicture = view.preview === 'previewing' && view.phase !== 'interrupted-data';
    show(video, showPicture);
    if (mirror) video.classList.toggle('is-mirrored', view.mirror);
    show(previewEmpty, !showPicture);
    show(play, view.canRetryPreview);
    if (resolution) {
      show(resolution, Boolean(view.resolution));
      text(resolution, view.resolution ? fill(copy.resolution, view.resolution) : '');
    }
  }
  text(listNote, view.deviceListNote ? copy[view.deviceListNote] || '' : '');
  text(current, view.currentLabel ? fill(copy.current, {device: view.currentLabel}) : copy.current_unknown);
  const signature = JSON.stringify([view.selectedToken, view.devices]);
  if (signature !== deviceSignature) {
    deviceSignature = signature;
    const previous = select.value;
    select.replaceChildren();
    const fallback = document.createElement('option');
    fallback.value = 'default';
    fallback.textContent = copy.default_device;
    select.append(fallback);
    for (const device of view.devices) {
      const option = document.createElement('option');
      option.value = device.token;
      option.textContent = device.label || fill(copy.unnamed_device, {n: device.unnamed});
      select.append(option);
    }
    const available = view.selectedToken === 'default' || view.devices.some(device => device.token === view.selectedToken);
    select.value = available ? view.selectedToken : previous || 'default';
  }
}

start.addEventListener('click', () => session.start());
stop.addEventListener('click', () => session.stop());
cancel.addEventListener('click', () => session.cancelWait());
retry.addEventListener('click', () => session.start());
refresh.addEventListener('click', () => { void session.refreshDevices(); });
select.addEventListener('change', () => session.selectDevice(select.value));
if (mirror) mirror.addEventListener('change', () => session.setMirror(mirror.checked));
if (play) play.addEventListener('click', () => { void session.retryPreview(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') session.notifyHidden(); });
window.addEventListener('pagehide', () => session.notifyPageHide());
window.addEventListener('pageshow', event => { if (event.persisted) session.stop(); });
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => session.notifyDeviceChange());
}
for (const link of document.querySelectorAll('[data-language-link]')) {
  link.addEventListener('click', () => session.notifyPageHide());
}
render(session.view());
