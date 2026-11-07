const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(process.env.SOURCE_HTML || path.join(__dirname, '..', 'index.html'), 'utf8');
const inlineScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).find(script => script.includes('async function gotDevices()'));
assert.ok(inlineScript, 'actual page startup script found');

function harness({ devices, enumerateError, captureError, permissionError } = {}) {
  const events = [];
  const track = name => ({ name, stopped: 0, stop() { this.stopped++; events.push(`stop:${name}`); } });
  const probeTracks = [track('probe-1'), track('probe-2')];
  const selectedTrack = track('selected');
  const replacementTrack = track('replacement');
  const permissionStream = { getTracks: () => probeTracks };
  const selectedStream = { getTracks: () => [selectedTrack] };
  const replacementStream = { getTracks: () => [replacementTrack] };
  const video = {};
  const select = { value: '', options: [], get length() { return this.options.length; }, appendChild(option) { this.options.push(option); if (!this.value) this.value = option.value; } };
  const requests = [];
  const context = vm.createContext({
    document: {
      getElementById: id => id === 'video' ? video : { getContext: () => ({}) },
      querySelector: () => select,
      createElement: () => ({})
    },
    window: {},
    console: { log() {}, error() {} },
    navigator: { mediaDevices: {
      async getUserMedia(constraints) {
        requests.push(constraints);
        events.push(`capture:${requests.length}`);
        if (requests.length === 1) { if (permissionError) throw permissionError; return permissionStream; }
        if (captureError) throw captureError;
        return requests.length === 2 ? selectedStream : replacementStream;
      },
      async enumerateDevices() {
        events.push('enumerate');
        assert.ok(probeTracks.every(track => track.stopped === 0), 'keep permission capture until enumeration');
        if (enumerateError) throw enumerateError;
        return devices || [{ kind: 'videoinput', deviceId: 'camera-1', label: 'Camera One' }];
      }
    } }
  });
  // Capture the page's own startup promise without changing its functions or handlers.
  vm.runInContext(inlineScript.replace(/^gotDevices\(\);\s*$/m, 'globalThis.startup = gotDevices();'), context);
  return { context, events, probeTracks, selectedTrack, selectedStream, replacementTrack, replacementStream, requests, select, video };
}

async function finish(h) {
  await h.context.startup;
  // Flush the selected getUserMedia().then(gotStream).catch(handleError) chain.
  await Promise.resolve();
  await Promise.resolve();
}

test('release all permission-probe tracks before selected camera acquisition', async () => {
  const h = harness();
  await finish(h);
  assert.deepEqual(h.probeTracks.map(track => track.stopped), [1, 1]);
  assert.ok(h.events.indexOf('stop:probe-2') < h.events.indexOf('capture:2'));
  assert.equal(h.selectedTrack.stopped, 0);
  assert.equal(h.context.window.stream, h.selectedStream);
  assert.equal(h.video.srcObject, h.selectedStream);
});

test('release permission-probe tracks if device enumeration rejects', async () => {
  const error = new Error('enumeration failed');
  const h = harness({ enumerateError: error });
  await assert.rejects(h.context.startup, error);
  assert.deepEqual(h.probeTracks.map(track => track.stopped), [1, 1]);
  assert.equal(h.requests.length, 1);
});

test('keep camera options, label fallback, and required 720p constraints', async () => {
  const h = harness({ devices: [
    { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
    { kind: 'videoinput', deviceId: 'camera-1', label: 'Camera One' },
    { kind: 'videoinput', deviceId: 'camera-2', label: '' }
  ] });
  await finish(h);
  assert.deepEqual(h.select.options.map(option => [option.value, option.text]), [['camera-1', 'Camera One'], ['camera-2', 'camera 2']]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests)), [
    { audio: false, video: true },
    { audio: false, video: { deviceId: { exact: 'camera-1' }, width: { exact: 1280 }, height: { exact: 720 } } }
  ]);
  assert.equal(h.video.width, 1280);
  assert.equal(h.video.height, 720);
});

test('selected camera failure does not leave the permission capture running', async () => {
  const h = harness({ captureError: new Error('camera unavailable') });
  await finish(h);
  assert.deepEqual(h.probeTracks.map(track => track.stopped), [1, 1]);
  assert.equal(h.context.window.stream, undefined);
});

test('changing cameras stops the managed stream without leaking the probe', async () => {
  const h = harness();
  await finish(h);
  h.select.value = 'camera-2';
  await h.select.onchange();
  assert.deepEqual(h.probeTracks.map(track => track.stopped), [1, 1]);
  assert.equal(h.selectedTrack.stopped, 1);
  assert.equal(h.requests[2].video.deviceId.exact, 'camera-2');
  assert.equal(h.context.window.stream, h.replacementStream);
  assert.equal(h.video.srcObject, h.replacementStream);
  assert.equal(h.replacementTrack.stopped, 0);
});

test('permission denial never enumerates or starts a selected capture', async () => {
  const error = new Error('permission denied');
  const h = harness({ permissionError: error });
  await assert.rejects(h.context.startup, error);
  assert.equal(h.requests.length, 1);
  assert.equal(h.events.includes('enumerate'), false);
});
