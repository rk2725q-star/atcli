/**
 * OpenCode File Bridge Server
 *
 * When the user launches OpenCode from ATCLI, this server runs in the background.
 * The user opens http://localhost:7891 in any browser to drag-drop files and images.
 * Files are saved to .opencode/uploads/ and injected into .opencode/instructions.md
 * so OpenCode sees them on the next message.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const BRIDGE_PORT = 7891;
const UPLOAD_DIR_NAME = '.opencode/uploads';
const INSTRUCTIONS_FILE = '.opencode/instructions.md';

const HTML_UI = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ATCLI → OpenCode File Bridge</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0d0d0d;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .logo {
      font-size: 13px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #666;
      margin-bottom: 32px;
    }
    .drop-zone {
      width: 100%;
      max-width: 560px;
      border: 2px dashed #333;
      border-radius: 16px;
      padding: 56px 32px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: #111;
      position: relative;
    }
    .drop-zone:hover, .drop-zone.drag-over {
      border-color: #4f8ef7;
      background: #0f1a2e;
    }
    .drop-icon { font-size: 48px; margin-bottom: 16px; }
    .drop-label {
      font-size: 16px;
      color: #aaa;
      margin-bottom: 8px;
    }
    .drop-hint { font-size: 12px; color: #555; }
    #file-input { display: none; }

    .log {
      width: 100%;
      max-width: 560px;
      margin-top: 24px;
    }
    .log-title { font-size: 12px; color: #555; margin-bottom: 10px; }
    .log-list { list-style: none; }
    .log-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 14px;
      background: #111;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 13px;
      border: 1px solid #1e1e1e;
    }
    .log-item .icon { font-size: 18px; flex-shrink: 0; }
    .log-item .info { flex: 1; min-width: 0; }
    .log-item .name { color: #fff; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .log-item .meta { color: #555; font-size: 11px; margin-top: 2px; }
    .log-item .status { font-size: 11px; color: #4caf50; font-weight: 600; flex-shrink: 0; }
    .log-item .status.err { color: #f44336; }

    .badge {
      display: inline-block;
      background: #4f8ef7;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 20px;
      margin-bottom: 32px;
    }
    .instructions {
      width: 100%;
      max-width: 560px;
      margin-top: 24px;
      background: #111;
      border: 1px solid #1e1e1e;
      border-radius: 12px;
      padding: 16px 20px;
      font-size: 12px;
      color: #666;
      line-height: 1.8;
    }
    .instructions strong { color: #aaa; }
    .instructions code {
      background: #1a1a1a;
      border-radius: 4px;
      padding: 1px 6px;
      color: #4f8ef7;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="logo">ATCLI Bridge</div>
  <h1>OpenCode File Upload</h1>
  <p class="subtitle">Drop files here → they appear in OpenCode automatically</p>
  <div class="badge">🔴 LIVE — OpenCode is running</div>

  <div class="drop-zone" id="drop-zone">
    <input type="file" id="file-input" multiple accept="*/*" />
    <div class="drop-icon">📎</div>
    <div class="drop-label">Drop files or images here</div>
    <div class="drop-hint">or click to browse — any file type supported</div>
  </div>

  <div class="log">
    <div class="log-title">UPLOAD LOG</div>
    <ul class="log-list" id="log-list">
      <li class="log-item">
        <span class="icon">ℹ️</span>
        <span class="info">
          <span class="name">Waiting for files...</span>
          <span class="meta">Files uploaded here are injected into OpenCode's context</span>
        </span>
      </li>
    </ul>
  </div>

  <div class="instructions">
    <strong>How it works:</strong><br/>
    1. Drop a file above → ATCLI saves it and updates <code>.opencode/instructions.md</code><br/>
    2. In OpenCode, type: <code>I've uploaded a new file, please review it</code><br/>
    3. OpenCode reads the injected context and processes your file<br/>
    <br/>
    <strong>Images:</strong> Saved to <code>.opencode/uploads/</code> folder. Tell OpenCode the filename.<br/>
    <strong>Code files:</strong> Injected as full code blocks with syntax highlighting hints.
  </div>

  <script>
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const logList = document.getElementById('log-list');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => uploadFiles(e.target.files));

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      uploadFiles(e.dataTransfer.files);
    });

    async function uploadFiles(files) {
      for (const file of files) {
        const logItem = addLogItem(file.name, 'Uploading...');
        const form = new FormData();
        form.append('file', file, file.name);
        try {
          const res = await fetch('/upload', { method: 'POST', body: form });
          const json = await res.json();
          updateLogItem(logItem, json.ok ? '✅ Injected' : '❌ ' + json.error, json.ok ? '' : 'err');
          if (json.ok && json.hint) {
            updateMeta(logItem, json.hint);
          }
        } catch (err) {
          updateLogItem(logItem, '❌ Network error', 'err');
        }
      }
    }

    function addLogItem(name, status) {
      if (logList.children.length === 1 && logList.children[0].querySelector('.name').textContent === 'Waiting for files...') {
        logList.innerHTML = '';
      }
      const li = document.createElement('li');
      li.className = 'log-item';
      li.innerHTML = \`
        <span class="icon">📄</span>
        <span class="info">
          <span class="name">\${name}</span>
          <span class="meta">Processing...</span>
        </span>
        <span class="status">\${status}</span>
      \`;
      logList.prepend(li);
      return li;
    }

    function updateLogItem(li, status, cls) {
      const s = li.querySelector('.status');
      s.textContent = status;
      if (cls === 'err') s.classList.add('err');
    }

    function updateMeta(li, text) {
      li.querySelector('.meta').textContent = text;
    }
  </script>
</body>
</html>`;

function getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const map: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
    };
    return map[ext] || 'application/octet-stream';
}

function isImageFile(filename: string): boolean {
    return /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i.test(filename);
}

function isTextFile(filename: string): boolean {
    return /\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|css|scss|html|json|yaml|yml|toml|md|txt|sh|bat|env|sql|xml|vue|svelte|kt|swift|rb|php)$/i.test(filename);
}

function getLang(filename: string): string {
    const ext = path.extname(filename).replace('.', '');
    const map: Record<string, string> = {
        'ts': 'typescript', 'tsx': 'tsx', 'js': 'javascript', 'jsx': 'jsx',
        'py': 'python', 'rs': 'rust', 'go': 'go', 'java': 'java',
        'css': 'css', 'scss': 'scss', 'html': 'html', 'json': 'json',
        'yaml': 'yaml', 'yml': 'yaml', 'md': 'markdown', 'sh': 'bash',
        'sql': 'sql', 'vue': 'vue', 'svelte': 'svelte',
    };
    return map[ext] || ext || 'text';
}

function injectIntoInstructions(cwd: string, content: string): void {
    const instrPath = path.join(cwd, INSTRUCTIONS_FILE);
    const dir = path.dirname(instrPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let existing = '';
    if (fs.existsSync(instrPath)) {
        existing = fs.readFileSync(instrPath, 'utf-8');
        // Remove old uploads section
        existing = existing.replace(/<!-- ATCLI_UPLOADS_START -->[\s\S]*?<!-- ATCLI_UPLOADS_END -->/g, '').trim();
    }

    // Read all current uploads section
    const uploadsMarkerPath = path.join(cwd, '.opencode', '.atcli_uploads_log');
    let uploadsLog: string[] = [];
    if (fs.existsSync(uploadsMarkerPath)) {
        uploadsLog = JSON.parse(fs.readFileSync(uploadsMarkerPath, 'utf-8'));
    }
    uploadsLog.push(content);
    fs.writeFileSync(uploadsMarkerPath, JSON.stringify(uploadsLog), 'utf-8');

    const uploadsSection = `<!-- ATCLI_UPLOADS_START -->\n## Files Uploaded via ATCLI Bridge\n\n${uploadsLog.join('\n\n')}\n<!-- ATCLI_UPLOADS_END -->`;
    fs.writeFileSync(instrPath, `${existing}\n\n${uploadsSection}\n`, 'utf-8');
}

function parseMultipart(body: Buffer, boundary: string): { filename: string; data: Buffer } | null {
    const boundaryBuf = Buffer.from('--' + boundary);
    let start = body.indexOf(boundaryBuf) + boundaryBuf.length + 2; // skip \r\n
    const headersEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headersEnd === -1) return null;

    const headers = body.slice(start, headersEnd).toString();
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    if (!filenameMatch) return null;

    const filename = filenameMatch[1];
    const dataStart = headersEnd + 4;
    const endBoundary = Buffer.from('\r\n--' + boundary);
    const dataEnd = body.indexOf(endBoundary, dataStart);
    const data = body.slice(dataStart, dataEnd === -1 ? undefined : dataEnd);

    return { filename, data };
}

export interface BridgeServer {
    stop: () => void;
    port: number;
}

export function startOpenCodeBridge(cwd: string): BridgeServer {
    const uploadDir = path.join(cwd, UPLOAD_DIR_NAME);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    // Clear old uploads log on new session
    const logPath = path.join(cwd, '.opencode', '.atcli_uploads_log');
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

    const server = http.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(HTML_UI);
            return;
        }

        if (req.method === 'POST' && req.url === '/upload') {
            const contentType = req.headers['content-type'] || '';
            const boundaryMatch = contentType.match(/boundary=(.+)/);
            if (!boundaryMatch) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'No boundary' }));
                return;
            }

            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => {
                const body = Buffer.concat(chunks);
                const parsed = parseMultipart(body, boundaryMatch[1]);
                if (!parsed) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'Parse failed' }));
                    return;
                }

                const { filename, data } = parsed;
                const ts = Date.now();
                const safeName = `${ts}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const savePath = path.join(uploadDir, safeName);
                fs.writeFileSync(savePath, data);

                let injectedContent = '';
                let hint = '';

                if (isImageFile(filename)) {
                    // Save image and reference by path
                    const relPath = `.opencode/uploads/${safeName}`;
                    injectedContent = `### Image: ${filename}\nSaved to: \`${relPath}\`\n> Tell OpenCode: "Review the image at ${relPath}"`;
                    hint = `Tell OpenCode: "Review the image at ${relPath}"`;
                } else if (isTextFile(filename)) {
                    // Embed full file content as code block
                    const text = data.toString('utf-8');
                    const lang = getLang(filename);
                    injectedContent = `### File: ${filename}\n\`\`\`${lang}\n${text.substring(0, 8000)}\n\`\`\``;
                    if (text.length > 8000) injectedContent += `\n*(truncated — ${text.length} chars total)*`;
                    hint = `Tell OpenCode: "I uploaded ${filename}, please review it"`;
                } else {
                    // Binary or unknown — just note it
                    injectedContent = `### File: ${filename}\nSaved to: \`.opencode/uploads/${safeName}\`\nSize: ${data.length} bytes`;
                    hint = `File saved to .opencode/uploads/${safeName}`;
                }

                try {
                    injectIntoInstructions(cwd, injectedContent);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true, filename: safeName, hint }));
                    console.log(`\n📎 [ATCLI Bridge] Injected into OpenCode: ${filename}`);
                } catch (e: any) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: e.message }));
                }
            });
            return;
        }

        res.writeHead(404);
        res.end();
    });

    server.listen(BRIDGE_PORT, '127.0.0.1', () => {
        console.log(`\n  📎 [ATCLI Bridge] File upload server: \x1b[36mhttp://localhost:${BRIDGE_PORT}\x1b[0m`);
        console.log(`  → Open in browser to drag-drop files & images into OpenCode\n`);
    });

    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`\n  ⚠️  [ATCLI Bridge] Port ${BRIDGE_PORT} already in use — skipping file server.`);
        }
    });

    return {
        stop: () => server.close(),
        port: BRIDGE_PORT,
    };
}
