const logEl = document.getElementById('log');
const localVideo = document.getElementById('local');
const remoteVideo = document.getElementById('remote');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let ws;
let recorder;
let mediaSource;
let sourceBuffer;
let started = false;

function log(msg) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent += `[${t}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function getMime() {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=avc1,opus',
    'video/webm'
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

async function initWs() {
  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${wsProto}://${location.host}`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => log('WebSocket aperto');
  ws.onclose = () => log('WebSocket chiuso');
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'saved') log('File salvato: ' + msg.path);
      } catch {}
      return;
    }
    appendRemoteChunk(new Uint8Array(ev.data));
  };
}

async function start() {
  await initWs();
  const mime = getMime();
  if (!mime) return log('Nessun MIME supportato');

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = stream;

  setupMSE(mime);
  recorder = new MediaRecorder(stream, { mimeType: mime });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) e.data.arrayBuffer().then((buf) => ws.send(buf));
  };
  recorder.start(500);

  ws.send(JSON.stringify({ type: 'start', filename: `rec-${Date.now()}` }));

  startBtn.disabled = true;
  stopBtn.disabled = false;
  started = true;
  log('Registrazione iniziata');
}

function stop() {
  if (!started) return;
  recorder.stop();
  ws.send(JSON.stringify({ type: 'stop' }));
  startBtn.disabled = false;
  stopBtn.disabled = true;
  started = false;
  log('Registrazione fermata');
}

function setupMSE(mime) {
  mediaSource = new MediaSource();
  remoteVideo.src = URL.createObjectURL(mediaSource);
  mediaSource.addEventListener('sourceopen', () => {
    sourceBuffer = mediaSource.addSourceBuffer(mime);
  });
}

function appendRemoteChunk(chunk) {
  if (!sourceBuffer || sourceBuffer.updating) {
    setTimeout(() => appendRemoteChunk(chunk), 50);
    return;
  }
  try {
    sourceBuffer.appendBuffer(chunk);
  } catch (e) {
    console.warn('appendBuffer error', e);
  }
}

startBtn.onclick = start;
stopBtn.onclick = stop;
