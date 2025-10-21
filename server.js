// server.js
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
// Se vuoi avere anche un redirect HTTP -> HTTPS su una porta diversa, imposta HTTP_REDIRECT_PORT
const HTTP_REDIRECT_PORT = process.env.HTTP_REDIRECT_PORT;
const PUBLIC_DIR = path.join(__dirname, 'public');
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'key.pem');
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'cert.pem');

if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR);

// Static request handler used by both HTTP and HTTPS servers
function requestHandler(req, res) {
  const filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime =
      ext === '.html' ? 'text/html' :
      ext === '.js' ? 'application/javascript' :
      'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// Create HTTPS server if key/cert are available, otherwise fallback to HTTP
let server;
let usingHttps = false;
try {
  if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    const key = fs.readFileSync(SSL_KEY_PATH);
    const cert = fs.readFileSync(SSL_CERT_PATH);
    server = https.createServer({ key, cert }, requestHandler);
    console.log('Avviando server HTTPS');
    usingHttps = true;
  } else {
    throw new Error('SSL files not found');
  }
} catch (err) {
  console.log('HTTPS non disponibile, avvio server HTTP:', err.message);
  server = http.createServer(requestHandler);
}

const wss = new WebSocketServer({ server });

const clients = new Map(); // ws -> { id, stream, filename }
let nextId = 1;

wss.on('connection', (ws) => {
  const id = nextId++;
  console.log(`Client ${id} connesso`);

  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'start') {
          const fileBase = sanitizeFilename(msg.filename || `session-${id}-${Date.now()}`);
          const filePath = path.join(RECORDINGS_DIR, fileBase + '.webm');
          const stream = fs.createWriteStream(filePath);
          clients.set(ws, { id, stream, filename: filePath });
          console.log(`Registrazione avviata: ${filePath}`);
        } else if (msg.type === 'stop') {
          const state = clients.get(ws);
          if (state) {
            state.stream.end();
            console.log(`Registrazione chiusa: ${state.filename}`);
            ws.send(JSON.stringify({ type: 'saved', path: path.basename(state.filename) }));
          }
        }
      } catch (e) {
        console.error('Errore JSON', e);
      }
    } else {
      const state = clients.get(ws);
      if (state?.stream && !state.stream.closed) {
        state.stream.write(data);
        // ritrasmetti agli altri client
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === client.OPEN) {
            client.send(data, { binary: true });
          }
        });
      }
    }
  });

  ws.on('close', () => {
    const state = clients.get(ws);
    if (state) {
      try { state.stream.end(); } catch {}
      clients.delete(ws);
      console.log(`Client ${id} disconnesso`);
    }
  });
});

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_\-\.]/gi, '_');
}

server.listen(PORT, () => {
  const scheme = usingHttps ? 'https' : 'http';
  console.log(`Server su ${scheme}://${HOST}:${PORT}`);
});

// (Opzionale) Avvia un piccolo server HTTP che fa redirect 301 su HTTPS, se specificato
if (usingHttps && HTTP_REDIRECT_PORT) {
  const redirectServer = http.createServer((req, res) => {
    const host = req.headers.host ? req.headers.host.replace(/:.*/, '') : HOST;
    const location = `https://${host}:${PORT}${req.url}`;
    res.writeHead(301, { Location: location });
    res.end();
  });
  redirectServer.listen(Number(HTTP_REDIRECT_PORT), () => {
    console.log(`Redirect HTTP -> HTTPS attivo su http://${HOST}:${HTTP_REDIRECT_PORT}`);
  });
}
