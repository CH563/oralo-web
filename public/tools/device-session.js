// Device capture session for the microphone and camera pages.
// Unit tests drive this with SYNTHETIC streams. Those stand-ins are not physical devices.

export const ACTIVITY_GAIN = 8;
export const ACTIVITY_ON = 0.01;
export const ACTIVITY_OFF = 0.005;
export const ACTIVITY_ON_MS = 300;
export const ACTIVITY_OFF_MS = 2000;
export const ANNOUNCE_STABLE_MS = 2000;
export const WAITING_LONG_MS = 20000;
export const ANALYSIS_SIZE = 2048;

const ACTIVITY_KEYS = new Set(['receiving', 'activity', 'quiet']);
const LIVE_PHASES = new Set(['requesting', 'starting', 'active', 'interrupted-data', 'switching']);

export function rms(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.sqrt(sum / samples.length);
}

export function meterLevel(samples) {
  const level = rms(samples) * ACTIVITY_GAIN;
  if (level <= 0) return 0;
  if (level >= 1) return 1;
  return level;
}

export function classifyMediaError(error) {
  const name = error && error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission_or_policy';
  if (name === 'NotFoundError') return 'not_found';
  if (name === 'NotReadableError') return 'not_readable';
  if (name === 'OverconstrainedError') return 'constraint';
  if (name === 'AbortError') return 'aborted';
  if (name === 'InvalidStateError') return 'inactive';
  return 'unknown';
}

export function inputConstraints(kind, deviceId) {
  const source = deviceId ? {deviceId: {exact: deviceId}} : true;
  if (kind === 'microphone') return {audio: source, video: false};
  if (kind === 'camera') return {audio: false, video: source};
  throw new Error('Unknown device kind');
}

function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch { /* stopping twice is safe */ }
  }
}

export function createDeviceSession(options) {
  const kind = options.kind;
  if (kind !== 'microphone' && kind !== 'camera') throw new Error('Unknown device kind');
  const now = options.now || (() => Date.now());
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancelTimer = options.cancelTimer || (id => clearTimeout(id));
  const requestFrame = options.requestFrame || (fn => requestAnimationFrame(fn));
  const cancelFrame = options.cancelFrame || (id => cancelAnimationFrame(id));
  const isVisible = options.isVisible || (() => true);
  let generation = 0;
  let pending = false;
  let held = [];
  let graph = null;
  let frameId = 0;
  let waitTimer = 0;
  let trackBinding = null;
  let zone = 'mid';
  let zoneSince = 0;
  let activity = null;
  let announced = 'idle';
  let pendingAnnounce = null;
  let pendingAnnounceSince = 0;
  let desiredDeviceId = null;
  let selectedToken = 'default';
  let devices = [];
  let enumerated = false;
  const tokenToId = new Map();
  const state = {
    kind,
    phase: 'idle',
    notice: null,
    error: null,
    activity: null,
    preview: null,
    waitingLong: false,
    pending: false,
    meter: null,
    devices: [],
    selectedToken: 'default',
    deviceListNote: 'device_list_before',
    currentLabel: null,
    resolution: null,
    mirror: false,
    announcement: 'idle'
  };

  function environmentError() {
    if (options.isEmbedded) return 'embedded';
    if (options.isSecureContext === false) return 'insecure';
    if (options.isSupported === false) return 'unsupported';
    return null;
  }

  function publish() {
    state.pending = pending;
    state.selectedToken = selectedToken;
    if (options.onChange) options.onChange(view());
  }

  function considerAnnounce(key, immediate) {
    const time = now();
    if (key === announced && pendingAnnounce === null) {
      state.announcement = announced;
      return;
    }
    if (immediate || !ACTIVITY_KEYS.has(key)) {
      announced = key;
      pendingAnnounce = null;
      state.announcement = key;
      return;
    }
    if (pendingAnnounce !== key) {
      pendingAnnounce = key;
      pendingAnnounceSince = time;
      return;
    }
    if (time - pendingAnnounceSince >= ANNOUNCE_STABLE_MS) {
      announced = key;
      pendingAnnounce = null;
      state.announcement = key;
    }
  }

  function releaseMedia() {
    if (waitTimer) cancelTimer(waitTimer);
    waitTimer = 0;
    if (frameId) cancelFrame(frameId);
    frameId = 0;
    if (trackBinding) {
      trackBinding.unbind();
      trackBinding = null;
    }
    for (const stream of held) stopStream(stream);
    held = [];
    const closing = graph;
    graph = null;
    if (closing) Promise.resolve(closing.close()).catch(() => {});
    if (options.clearPreview) {
      try { options.clearPreview(); } catch { /* preview cleanup stays idempotent */ }
    }
    activity = null;
    zone = 'mid';
    state.meter = null;
    state.activity = null;
    state.preview = null;
    state.resolution = null;
    state.currentLabel = null;
  }

  function invalidate(phase, notice) {
    generation += 1;
    releaseMedia();
    state.phase = phase;
    state.notice = notice;
    state.error = null;
    state.waitingLong = false;
    considerAnnounce(statusKey(view()), true);
    publish();
  }

  function fail(errorKey) {
    releaseMedia();
    state.phase = 'error';
    state.error = errorKey;
    state.notice = null;
    state.waitingLong = false;
    considerAnnounce(errorKey, true);
    publish();
  }

  function rememberDevices(list) {
    tokenToId.clear();
    devices = [];
    let unnamed = 0;
    const inputKind = kind === 'microphone' ? 'audioinput' : 'videoinput';
    for (const item of list || []) {
      if (!item || item.kind !== inputKind) continue;
      const token = `input-${devices.length + 1}`;
      const label = item.label ? String(item.label) : '';
      if (!label) unnamed += 1;
      tokenToId.set(token, item.deviceId || '');
      devices.push({token, label, unnamed: label ? 0 : unnamed});
    }
    enumerated = true;
    state.devices = devices.map(item => ({token: item.token, label: item.label, unnamed: item.unnamed}));
    state.deviceListNote = devices.length && devices.some(item => item.label) ? null : 'device_list_limited';
    if (selectedToken !== 'default' && !tokenToId.has(selectedToken)) selectedToken = 'default';
  }

  function bindTrack(track, gen) {
    if (!track || typeof track.addEventListener !== 'function') return;
    const onMute = () => {
      if (gen !== generation || track.readyState === 'ended') return;
      if (state.phase === 'stopped' || state.phase === 'cancelled' || state.phase === 'error') return;
      state.meter = null;
      state.activity = null;
      state.preview = null;
      state.phase = 'interrupted-data';
      considerAnnounce('muted', true);
      publish();
    };
    const onUnmute = () => {
      if (gen !== generation || !isVisible() || track.readyState !== 'live' || track.muted) return;
      if (state.phase !== 'interrupted-data') return;
      state.phase = 'active';
      if (kind === 'microphone') {
        activity = 'receiving';
        state.activity = 'receiving';
        scheduleAnalysis(gen);
      } else {
        state.preview = 'previewing';
      }
      considerAnnounce(statusKey(view()), true);
      publish();
    };
    const onEnded = () => {
      if (gen !== generation) return;
      if (state.phase === 'stopped' || state.phase === 'cancelled') return;
      releaseMedia();
      state.phase = 'interrupted';
      state.notice = 'interrupted';
      state.error = null;
      considerAnnounce('interrupted', true);
      publish();
    };
    track.addEventListener('mute', onMute);
    track.addEventListener('unmute', onUnmute);
    track.addEventListener('ended', onEnded);
    trackBinding = {
      unbind() {
        track.removeEventListener('mute', onMute);
        track.removeEventListener('unmute', onUnmute);
        track.removeEventListener('ended', onEnded);
      }
    };
  }

  function confirmSelection(track) {
    const settings = track.getSettings ? track.getSettings() : {};
    const reported = settings && settings.deviceId;
    if (desiredDeviceId) {
      if (!reported || reported !== desiredDeviceId) return {ok: false};
      const match = devices.find(item => tokenToId.get(item.token) === reported);
      return {ok: true, label: match && match.label ? match.label : null, width: settings.width, height: settings.height};
    }
    const match = reported ? devices.find(item => tokenToId.get(item.token) === reported && item.label) : null;
    return {ok: true, label: match ? match.label : null, width: settings.width, height: settings.height};
  }

  function applyResolution(width, height) {
    const numeric = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
    state.resolution = numeric(width) && numeric(height) ? {width, height} : null;
  }

  function scheduleAnalysis(gen) {
    if (frameId) cancelFrame(frameId);
    const tick = () => {
      frameId = 0;
      if (gen !== generation || !graph || state.phase !== 'active') return;
      const contextState = graph.state();
      const track = held[0] && held[0].getTracks()[0];
      if (!track || track.readyState !== 'live' || track.muted || contextState !== 'running') {
        state.meter = null;
        state.activity = 'analysis_suspended';
        considerAnnounce('analysis_suspended', true);
        publish();
        if (contextState === 'closed' || !track || track.readyState === 'ended') {
          releaseMedia();
          state.phase = 'error';
          state.error = 'unknown';
          considerAnnounce('unknown', true);
          publish();
          return;
        }
        frameId = requestFrame(tick);
        return;
      }
      const samples = graph.readSamples();
      const value = rms(samples);
      state.meter = meterLevel(samples);
      const time = now();
      let nextZone = 'mid';
      if (value >= ACTIVITY_ON) nextZone = 'high';
      else if (value < ACTIVITY_OFF) nextZone = 'low';
      if (nextZone !== zone) {
        zone = nextZone;
        zoneSince = time;
      }
      if (zone === 'high' && time - zoneSince >= ACTIVITY_ON_MS) activity = 'activity';
      else if (zone === 'low' && time - zoneSince >= ACTIVITY_OFF_MS) activity = 'quiet';
      if (!activity) activity = 'receiving';
      state.activity = activity;
      considerAnnounce(activity, false);
      publish();
      frameId = requestFrame(tick);
    };
    frameId = requestFrame(tick);
  }

  async function beginCapture(gen) {
    const blocked = environmentError();
    if (blocked) {
      pending = false;
      state.phase = 'unavailable';
      state.error = blocked;
      considerAnnounce(blocked, true);
      publish();
      return;
    }
    pending = true;
    state.phase = state.phase === 'switching' ? 'switching' : 'requesting';
    state.notice = null;
    state.error = null;
    state.waitingLong = false;
    state.meter = null;
    state.activity = null;
    state.preview = null;
    considerAnnounce(state.phase === 'switching' ? 'switching' : 'requesting', true);
    publish();
    waitTimer = schedule(() => {
      if (gen !== generation || !pending) return;
      state.waitingLong = true;
      considerAnnounce('waiting_long', true);
      publish();
    }, WAITING_LONG_MS);
    let stream;
    try {
      stream = await options.getUserMedia(inputConstraints(kind, desiredDeviceId));
    } catch (error) {
      if (waitTimer) cancelTimer(waitTimer);
      waitTimer = 0;
      pending = false;
      if (gen !== generation) {
        publish();
        return;
      }
      fail(classifyMediaError(error));
      return;
    }
    if (waitTimer) cancelTimer(waitTimer);
    waitTimer = 0;
    pending = false;
    if (gen !== generation || !isVisible()) {
      stopStream(stream);
      publish();
      return;
    }
    held = [stream];
    state.phase = 'starting';
    considerAnnounce(kind === 'camera' ? 'stream_acquired' : 'requesting', true);
    publish();
    try {
      const listed = await options.enumerateDevices();
      if (gen !== generation) {
        stopStream(stream);
        held = [];
        publish();
        return;
      }
      rememberDevices(listed);
    } catch {
      if (gen !== generation) {
        stopStream(stream);
        held = [];
        publish();
        return;
      }
      state.deviceListNote = 'device_list_failed';
    }
    const track = stream.getTracks().find(item => item.kind === (kind === 'microphone' ? 'audio' : 'video')) || stream.getTracks()[0];
    if (!track || track.readyState === 'ended') {
      fail('unknown');
      return;
    }
    const confirmed = confirmSelection(track);
    if (!confirmed.ok) {
      releaseMedia();
      state.phase = 'error';
      state.error = 'selection_mismatch';
      considerAnnounce('selection_mismatch', true);
      publish();
      return;
    }
    state.currentLabel = confirmed.label;
    applyResolution(confirmed.width, confirmed.height);
    bindTrack(track, gen);
    if (kind === 'microphone') {
      try {
        graph = await options.createAudioGraph(stream);
        if (gen !== generation) {
          releaseMedia();
          publish();
          return;
        }
        await graph.resume();
      } catch {
        if (gen !== generation) return;
        fail('unknown');
        return;
      }
      if (gen !== generation) {
        releaseMedia();
        publish();
        return;
      }
      if (!graph || graph.state() !== 'running') {
        state.phase = 'active';
        state.activity = 'analysis_suspended';
        state.meter = null;
        considerAnnounce('analysis_suspended', true);
        publish();
        if (graph && graph.observe) {
          graph.observe(contextState => {
            if (gen !== generation || state.phase === 'stopped' || state.phase === 'cancelled') return;
            if (contextState === 'running' && isVisible()) {
              state.phase = 'active';
              activity = 'receiving';
              state.activity = 'receiving';
              scheduleAnalysis(gen);
              considerAnnounce('receiving', true);
              publish();
            } else {
              if (frameId) cancelFrame(frameId);
              frameId = 0;
              state.meter = null;
              state.activity = 'analysis_suspended';
              considerAnnounce('analysis_suspended', true);
              publish();
            }
          });
        }
        return;
      }
      state.phase = 'active';
      activity = 'receiving';
      zone = 'mid';
      zoneSince = now();
      state.activity = 'receiving';
      considerAnnounce('receiving', true);
      publish();
      scheduleAnalysis(gen);
      return;
    }
    state.preview = 'stream_acquired';
    publish();
    let previewState = 'stream_acquired';
    try {
      previewState = await options.attachPreview(stream);
    } catch {
      previewState = 'preview_blocked';
    }
    if (gen !== generation) {
      stopStream(stream);
      held = [];
      if (options.clearPreview) options.clearPreview();
      publish();
      return;
    }
    state.preview = previewState === 'previewing' ? 'previewing' : previewState === 'preview_blocked' ? 'preview_blocked' : 'stream_acquired';
    state.phase = state.preview === 'previewing' ? 'active' : 'starting';
    considerAnnounce(state.preview === 'previewing' ? 'previewing' : state.preview === 'preview_blocked' ? 'preview_blocked' : 'stream_acquired', true);
    publish();
  }

  function view() {
    const phase = state.phase;
    const selectable = !pending && (phase === 'active' || phase === 'interrupted-data' || phase === 'starting');
    return {
      kind,
      phase,
      notice: state.notice,
      error: state.error,
      activity: state.activity,
      preview: state.preview,
      waitingLong: state.waitingLong,
      pending,
      meter: state.meter,
      devices: state.devices.map(item => ({token: item.token, label: item.label, unnamed: item.unnamed})),
      selectedToken,
      deviceListNote: state.deviceListNote,
      currentLabel: state.currentLabel,
      resolution: state.resolution ? {width: state.resolution.width, height: state.resolution.height} : null,
      mirror: state.mirror,
      canStart: !pending && phase !== 'unavailable' && !LIVE_PHASES.has(phase),
      canCancel: pending || phase === 'requesting' || phase === 'switching',
      canStop: pending || LIVE_PHASES.has(phase),
      canSelect: selectable,
      canRefresh: enumerated && !pending && phase !== 'unavailable',
      canRetryPreview: state.preview === 'preview_blocked' && !pending,
      status: statusKey({...state, pending, kind}),
      announcement: state.announcement
    };
  }

  const initial = environmentError();
  if (initial) {
    state.phase = 'unavailable';
    state.error = initial;
    state.announcement = initial;
    announced = initial;
  }

  return {
    view,
    start() {
      if (pending) {
        state.notice = 'pending_unsettled';
        considerAnnounce('pending_unsettled', true);
        publish();
        return;
      }
      const blocked = environmentError();
      if (blocked) {
        state.phase = 'unavailable';
        state.error = blocked;
        considerAnnounce(blocked, true);
        publish();
        return;
      }
      const gen = ++generation;
      state.phase = 'requesting';
      void beginCapture(gen);
    },
    stop() {
      invalidate('stopped', 'stopped');
    },
    cancelWait() {
      invalidate('cancelled', 'cancelled');
    },
    selectDevice(token) {
      if (pending) return;
      if (token !== 'default' && !tokenToId.has(token)) return;
      selectedToken = token;
      desiredDeviceId = token === 'default' ? null : tokenToId.get(token);
      state.selectedToken = token;
      if (!LIVE_PHASES.has(state.phase)) {
        publish();
        return;
      }
      const gen = ++generation;
      releaseMedia();
      state.phase = 'switching';
      considerAnnounce('switching', true);
      publish();
      void beginCapture(gen);
    },
    async refreshDevices() {
      if (!enumerated || pending || !options.enumerateDevices) return;
      const previous = [...tokenToId.values()];
      try {
        rememberDevices(await options.enumerateDevices());
      } catch {
        state.deviceListNote = 'device_list_failed';
        publish();
        return;
      }
      const next = new Set(tokenToId.values());
      const changed = previous.length !== next.size || previous.some(id => !next.has(id));
      if (changed && (LIVE_PHASES.has(state.phase) || held.length)) {
        invalidate('interrupted', 'device_changed');
        return;
      }
      publish();
    },
    setMirror(enabled) {
      state.mirror = Boolean(enabled);
      publish();
    },
    async retryPreview() {
      if (state.preview !== 'preview_blocked' || !held[0] || !options.attachPreview) return;
      const gen = generation;
      let previewState = 'preview_blocked';
      try { previewState = await options.attachPreview(held[0]); } catch { previewState = 'preview_blocked'; }
      if (gen !== generation) return;
      state.preview = previewState === 'previewing' ? 'previewing' : 'preview_blocked';
      if (state.preview === 'previewing') state.phase = 'active';
      considerAnnounce(state.preview === 'previewing' ? 'previewing' : 'preview_blocked', true);
      publish();
    },
    notifyHidden() {
      invalidate('stopped', 'hidden');
    },
    notifyPageHide() {
      invalidate('stopped', 'stopped');
    },
    notifyDeviceChange() {
      if (!LIVE_PHASES.has(state.phase) && !pending) return;
      invalidate('interrupted', 'device_changed');
    },
    destroy() {
      invalidate('stopped', 'stopped');
    }
  };
}

export function statusKey(state) {
  if (state.pending && state.phase !== 'requesting' && state.phase !== 'switching' && state.phase !== 'starting') return 'pending_unsettled';
  if (state.notice === 'pending_unsettled' && state.pending) return 'pending_unsettled';
  if (state.phase === 'unavailable') return state.error || 'unsupported';
  if (state.phase === 'error') return state.error || 'unknown';
  if (state.phase === 'requesting' && state.waitingLong) return 'waiting_long';
  if (state.phase === 'requesting') return 'requesting';
  if (state.phase === 'switching') return 'switching';
  if (state.phase === 'interrupted-data') return 'muted';
  if (state.phase === 'interrupted') return state.notice === 'device_changed' ? 'device_changed' : 'interrupted';
  if (state.phase === 'stopped') return state.notice === 'hidden' ? 'hidden' : 'stopped';
  if (state.phase === 'cancelled') return state.pending ? 'pending_unsettled' : 'cancelled';
  if (state.phase === 'starting' || state.phase === 'active') {
    if (state.kind === 'camera') {
      if (state.preview === 'previewing') return 'previewing';
      if (state.preview === 'preview_blocked') return 'preview_blocked';
      return 'stream_acquired';
    }
    if (state.activity === 'analysis_suspended') return 'analysis_suspended';
    if (state.activity === 'activity') return 'activity';
    if (state.activity === 'quiet') return 'quiet';
    if (state.activity === 'receiving') return 'receiving';
    return 'requesting';
  }
  return 'idle';
}
