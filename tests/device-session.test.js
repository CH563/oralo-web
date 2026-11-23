import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceSession, classifyMediaError, inputConstraints, meterLevel, rms, ACTIVITY_ON_MS, ACTIVITY_OFF_MS, ANNOUNCE_STABLE_MS, WAITING_LONG_MS} from '../public/tools/device-session.js';

// SYNTHETIC media doubles. They do not represent a physical microphone, camera, or browser permission prompt.
function syntheticTrack(kind, settings = {}) {
  const listeners = {mute: new Set(), unmute: new Set(), ended: new Set()};
  return {
    kind,
    synthetic: true,
    readyState: 'live',
    muted: false,
    _settings: {deviceId: settings.deviceId, width: settings.width, height: settings.height},
    getSettings() { return this._settings; },
    stop() { this.readyState = 'ended'; this.emit('ended'); },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = new Set())).add(fn); },
    removeEventListener(type, fn) { listeners[type] && listeners[type].delete(fn); },
    emit(type) { for (const fn of listeners[type] || []) fn(); }
  };
}
function syntheticStream(tracks) {
  return {synthetic: true, getTracks: () => tracks};
}
function deferred() {
  let settle;
  const promise = new Promise(resolve => { settle = resolve; });
  return {promise, resolve: settle};
}

function harness(overrides = {}) {
  let time = 0;
  const timers = [];
  const frames = [];
  const calls = [];
  const previews = [];
  const cleared = [];
  let devices = overrides.devices || [{kind: overrides.kind === 'camera' ? 'videoinput' : 'audioinput', deviceId: 'synth-a', label: 'Synthetic A'}];
  const pending = [];
  const session = createDeviceSession({
    kind: overrides.kind || 'microphone',
    isSecureContext: overrides.isSecureContext !== false,
    isSupported: overrides.isSupported !== false,
    isEmbedded: Boolean(overrides.isEmbedded),
    isVisible: () => overrides.visible ? overrides.visible() : true,
    now: () => time,
    schedule(fn, ms) { const id = timers.push({fn, at: time + ms}); return id; },
    cancelTimer(id) { if (timers[id - 1]) timers[id - 1].cancelled = true; },
    requestFrame(fn) { return frames.push(fn); },
    cancelFrame(id) { frames[id - 1] = null; },
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (overrides.failWith) throw overrides.failWith;
      const gate = deferred();
      pending.push(gate);
      const stream = await gate.promise;
      if (overrides.onGranted) overrides.onGranted(stream);
      return stream;
    },
    async enumerateDevices() {
      if (overrides.enumerateError) throw overrides.enumerateError;
      return devices;
    },
    async createAudioGraph(stream) {
      const track = stream.getTracks()[0];
      let contextState = overrides.contextState || 'running';
      let observer = null;
      return {
        stream,
        state: () => contextState,
        async resume() { if (overrides.resumeTo) contextState = overrides.resumeTo; },
        readSamples: () => overrides.samples || new Float32Array(2048).fill(overrides.sample || 0),
        observe(fn) { observer = fn; },
        setState(next) { contextState = next; if (observer) observer(next); },
        async close() { contextState = 'closed'; track.graphClosed = true; }
      };
    },
    async attachPreview(stream) {
      previews.push(stream);
      return overrides.previewResult || 'previewing';
    },
    clearPreview() { cleared.push(true); if (overrides.onClear) overrides.onClear(); },
    ...overrides.session
  });
  return {
    session, calls, pending, previews, cleared, frames, timers,
    setTime(value) { time = value; },
    advance(ms) { time += ms; for (const timer of timers) if (!timer.cancelled && !timer.ran && timer.at <= time) { timer.ran = true; timer.fn(); } },
    fireFrame() { const fn = frames.filter(Boolean).at(-1); if (fn) fn(); },
    grant(settings = {}) {
      const kind = overrides.kind === 'camera' ? 'video' : 'audio';
      const track = syntheticTrack(kind, {deviceId: 'synth-a', width: 640, height: 480, ...settings});
      const stream = syntheticStream([track]);
      pending.at(-1).resolve(stream);
      return {track, stream};
    },
    setDevices(next) { devices = next; }
  };
}

async function flush() { await new Promise(resolve => setTimeout(resolve, 0)); }

test('SYNTHETIC level mapping is a relative gain, not calibrated decibels', () => {
  assert.equal(rms(Float32Array.from([0.5, -0.5])), 0.5);
  assert.equal(meterLevel(new Float32Array(2048).fill(0)), 0);
  assert.equal(meterLevel(new Float32Array(2048).fill(0.2)), 1);
  assert.equal(classifyMediaError({name: 'NotAllowedError', message: 'device label leak'}), 'permission_or_policy');
  assert.equal(classifyMediaError({name: 'SecurityError'}), 'permission_or_policy');
  assert.equal(classifyMediaError({name: 'NotFoundError'}), 'not_found');
  assert.equal(classifyMediaError({name: 'NotReadableError'}), 'not_readable');
  assert.equal(classifyMediaError({name: 'OverconstrainedError'}), 'constraint');
  assert.equal(classifyMediaError({name: 'AbortError'}), 'aborted');
  assert.equal(classifyMediaError({name: 'InvalidStateError'}), 'inactive');
  assert.equal(classifyMediaError({name: 'SomethingElse', message: 'mic-secret'}), 'unknown');
  assert.deepEqual(inputConstraints('microphone', null), {audio: true, video: false});
  assert.deepEqual(inputConstraints('camera', 'abc'), {audio: false, video: {deviceId: {exact: 'abc'}}});
});

test('SYNTHETIC startup does not call getUserMedia until Start, and requests only one kind', async () => {
  const mic = harness();
  assert.equal(mic.session.view().status, 'idle');
  assert.equal(mic.calls.length, 0);
  mic.session.start();
  assert.equal(mic.calls.length, 1);
  assert.deepEqual(mic.calls[0], {audio: true, video: false});
  const camera = harness({kind: 'camera'});
  camera.session.start();
  assert.deepEqual(camera.calls[0], {audio: false, video: true});
});

test('SYNTHETIC insecure, unsupported, and embedded environments never request media', () => {
  for (const options of [{isSecureContext: false, error: 'insecure'}, {isSupported: false, error: 'unsupported'}, {isEmbedded: true, error: 'embedded'}]) {
    const {session, calls} = harness(options);
    assert.equal(session.view().status, options.error);
    session.start();
    assert.equal(calls.length, 0);
  }
});

test('SYNTHETIC cancel and stop before resolution drop the late stream and block a second request', async () => {
  const {session, calls, pending, grant} = harness();
  session.start();
  session.cancelWait();
  assert.equal(session.view().status, 'pending_unsettled');
  session.start();
  assert.equal(calls.length, 1);
  const {track} = grant();
  await flush();
  assert.equal(track.readyState, 'ended');
  assert.equal(session.view().phase, 'cancelled');
  assert.equal(calls.length, 1);
  session.start();
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(pending.length, 2);
});

test('SYNTHETIC hiding during a pending request stops the late stream and does not resume', async () => {
  let visible = true;
  const {session, calls, grant} = harness({visible: () => visible});
  session.start();
  visible = false;
  session.notifyHidden();
  const {track} = grant();
  await flush();
  assert.equal(track.readyState, 'ended');
  assert.equal(session.view().status, 'hidden');
  visible = true;
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(session.view().phase, 'stopped');
});

test('SYNTHETIC page hide releases a running microphone graph', async () => {
  const {session, grant} = harness();
  session.start();
  const {track} = grant();
  await flush();
  assert.equal(session.view().status, 'receiving');
  session.notifyPageHide();
  assert.equal(track.readyState, 'ended');
  assert.equal(track.graphClosed, true);
  assert.equal(session.view().meter, null);
  session.notifyPageHide();
  assert.equal(session.view().status, 'stopped');
});

test('SYNTHETIC long wait is not treated as a denial, and errors do not echo raw messages', async () => {
  const waiting = harness();
  waiting.session.start();
  waiting.advance(WAITING_LONG_MS);
  assert.equal(waiting.session.view().status, 'waiting_long');
  assert.equal(waiting.session.view().phase, 'requesting');
  const denied = harness({failWith: {name: 'NotAllowedError', message: 'secret-device-label'}});
  denied.session.start();
  await flush();
  const view = denied.session.view();
  assert.equal(view.status, 'permission_or_policy');
  assert.equal(denied.calls.length, 1);
  assert.equal(JSON.stringify(view).includes('secret-device-label'), false);
  denied.session.start();
  await flush();
  assert.equal(denied.calls.length, 2, 'only a later manual start may request again');
});

test('SYNTHETIC meter moves only after the documented hold times and announcements wait', async () => {
  let sample = 0;
  let time = 0;
  const timers = [];
  const frames = [];
  let resolveGrant;
  const session = createDeviceSession({
    kind: 'microphone',
    now: () => time,
    schedule(fn, ms) { return timers.push({fn, at: time + ms}); },
    cancelTimer() {},
    requestFrame(fn) { return frames.push(fn); },
    cancelFrame(id) { frames[id - 1] = null; },
    isVisible: () => true,
    async getUserMedia() { return new Promise(resolve => { resolveGrant = resolve; }); },
    async enumerateDevices() { return [{kind: 'audioinput', deviceId: 'secret-id', label: 'Synthetic mic'}]; },
    async createAudioGraph() {
      return {state: () => 'running', async resume() {}, readSamples: () => new Float32Array(2048).fill(sample), async close() {}};
    }
  });
  session.start();
  const track = syntheticTrack('audio', {deviceId: 'secret-id'});
  resolveGrant(syntheticStream([track]));
  await flush();
  assert.equal(session.view().status, 'receiving');
  assert.equal(JSON.stringify(session.view()).includes('secret-id'), false);
  sample = 0.02;
  frames.at(-1)();
  assert.equal(session.view().activity, 'receiving');
  time = ACTIVITY_ON_MS;
  frames.at(-1)();
  assert.equal(session.view().activity, 'activity');
  assert.equal(session.view().announcement, 'receiving');
  time = ACTIVITY_ON_MS + ANNOUNCE_STABLE_MS;
  frames.at(-1)();
  assert.equal(session.view().announcement, 'activity');
  sample = 0.007;
  frames.at(-1)();
  assert.equal(session.view().activity, 'activity');
  sample = 0.0001;
  const quietStart = time;
  frames.at(-1)();
  time = quietStart + ACTIVITY_OFF_MS - 1;
  frames.at(-1)();
  assert.equal(session.view().activity, 'activity');
  time = quietStart + ACTIVITY_OFF_MS;
  frames.at(-1)();
  assert.equal(session.view().activity, 'quiet');
  assert.notEqual(session.view().meter, null);
  session.stop();
  assert.equal(session.view().meter, null);
  assert.equal(track.readyState, 'ended');
});

test('SYNTHETIC suspended analysis does not present a zero measurement', async () => {
  const {session, grant} = harness({contextState: 'suspended', resumeTo: 'suspended'});
  session.start();
  grant();
  await flush();
  assert.equal(session.view().status, 'analysis_suspended');
  assert.equal(session.view().meter, null);
});

test('SYNTHETIC explicit device failure does not fall back, and a mismatch stops', async () => {
  let attempts = 0;
  const failed = harness({
    session: {
      async getUserMedia(constraints) {
        failed.calls.push(constraints);
        attempts += 1;
        if (attempts > 1) throw {name: 'OverconstrainedError', message: 'exact secret'};
        const gate = deferred();
        failed.pending.push(gate);
        return gate.promise;
      }
    }
  });
  failed.session.start();
  const first = failed.grant();
  await flush();
  const token = failed.session.view().devices[0].token;
  failed.session.selectDevice(token);
  await flush();
  assert.equal(failed.calls.at(-1).video, false);
  assert.deepEqual(failed.calls.at(-1).audio.deviceId, {exact: 'synth-a'});
  assert.equal(failed.session.view().status, 'constraint');
  assert.equal(failed.calls.length, 2);
  assert.equal(JSON.stringify(failed.session.view()).includes('secret'), false);
  assert.equal(first.track.readyState, 'ended');

  const mismatch = harness();
  mismatch.session.start();
  mismatch.grant();
  await flush();
  const selected = mismatch.session.view().devices[0].token;
  mismatch.session.selectDevice(selected);
  const track = syntheticTrack('audio', {deviceId: 'other-device'});
  mismatch.pending.at(-1).resolve(syntheticStream([track]));
  await flush();
  assert.equal(mismatch.session.view().status, 'selection_mismatch');
  assert.equal(track.readyState, 'ended');
});

test('SYNTHETIC switching stops the previous stream before the next request', async () => {
  const seen = [];
  const {session, pending, grant} = harness({
    onGranted() {},
    session: {}
  });
  session.start();
  const first = grant();
  await flush();
  const token = session.view().devices[0].token;
  const original = pending.at(-1);
  session.selectDevice(token);
  assert.equal(first.track.readyState, 'ended');
  assert.equal(session.view().status, 'switching');
  const second = syntheticTrack('audio', {deviceId: 'synth-a'});
  pending.at(-1).resolve(syntheticStream([second]));
  await flush();
  assert.equal(session.view().phase, 'active');
  assert.equal(original, pending[0]);
  seen.push(second.readyState);
  assert.equal(seen[0], 'live');
});

test('SYNTHETIC enumerate failure does not erase a running capture', async () => {
  const {session, grant} = harness({enumerateError: new Error('hidden device list')});
  session.start();
  const {track} = grant();
  await flush();
  assert.equal(track.readyState, 'live');
  assert.equal(session.view().phase, 'active');
  assert.equal(session.view().deviceListNote, 'device_list_failed');
  assert.equal(JSON.stringify(session.view()).includes('hidden device list'), false);
});

test('SYNTHETIC mute, unmute, and ended do not restart after stop', async () => {
  const {session, grant, calls} = harness();
  session.start();
  const {track} = grant();
  await flush();
  track.muted = true;
  track.emit('mute');
  assert.equal(session.view().status, 'muted');
  assert.equal(session.view().meter, null);
  track.muted = false;
  track.emit('unmute');
  assert.equal(session.view().status, 'receiving');
  assert.equal(calls.length, 1);
  session.stop();
  track.muted = false;
  track.emit('unmute');
  track.emit('ended');
  assert.equal(session.view().status, 'stopped');
  assert.equal(calls.length, 1);
});

test('SYNTHETIC ended track interrupts and device changes do not auto-start', async () => {
  const {session, grant, calls, setDevices} = harness();
  session.start();
  const {track} = grant();
  await flush();
  track.readyState = 'ended';
  track.emit('ended');
  assert.equal(session.view().status, 'interrupted');
  assert.equal(calls.length, 1);
  const again = harness();
  again.session.start();
  again.grant();
  await flush();
  again.session.notifyDeviceChange();
  assert.equal(again.session.view().status, 'device_changed');
  assert.equal(again.calls.length, 1);
  again.setDevices([{kind: 'audioinput', deviceId: 'synth-b', label: ''}]);
  await again.session.refreshDevices();
  assert.equal(again.session.view().devices[0].unnamed, 1);
  assert.equal(again.session.view().devices[0].label, '');
});

test('SYNTHETIC camera preview waits for playback and releases on stop', async () => {
  const blocked = harness({kind: 'camera', previewResult: 'preview_blocked'});
  blocked.session.start();
  const first = blocked.grant({deviceId: 'synth-a', width: 0, height: 480});
  await flush();
  assert.equal(blocked.session.view().status, 'preview_blocked');
  assert.equal(blocked.session.view().resolution, null);
  assert.equal(blocked.previews.length, 1);
  blocked.session.setMirror(true);
  assert.equal(blocked.session.view().mirror, true);
  await blocked.session.retryPreview();
  assert.equal(blocked.calls.length, 1, 'preview retry must not request the camera again');
  assert.equal(blocked.previews[0], blocked.previews[1]);
  blocked.session.stop();
  assert.equal(first.track.readyState, 'ended');
  assert.equal(blocked.cleared.length > 0, true);

  const shown = harness({kind: 'camera', previewResult: 'previewing'});
  shown.session.start();
  shown.grant({width: 1280, height: 720});
  await flush();
  assert.equal(shown.session.view().status, 'previewing');
  assert.deepEqual(shown.session.view().resolution, {width: 1280, height: 720});
  assert.equal(shown.calls[0].audio, false);
});
