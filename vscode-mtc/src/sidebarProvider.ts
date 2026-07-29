import * as vscode from "vscode";
import { WebSocketClient, type WsMessage } from "./webSocketClient";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mtc.sidebar";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _client: WebSocketClient,
  ) {
    this._client.on("stateChange", (state: string) => {
      this._postMessage({ type: "connectionState", state });
    });
    this._client.on("message", (msg: WsMessage) => {
      this._postMessage(msg);
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.command) {
        case "query":
          this._client.sendQuery(data.text);
          break;
        case "toolCall":
          this._client.sendToolCall(data.tool, data.args);
          break;
        case "permission":
          this._client.respondPermission(data.requestId, data.response);
          break;
        case "connect":
          this._client.connect();
          break;
        case "disconnect":
          this._client.disconnect();
          break;
      }
    });

    this._postMessage({
      type: "connectionState",
      state: this._client.state,
    });
  }

  private _postMessage(msg: Record<string, unknown>): void {
    this._view?.webview.postMessage(msg);
  }

  private _getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>MTC Agent</title>
  <style>
    :root {
      --bg: #1e1e1e;
      --surface: #252526;
      --border: #3c3c3c;
      --text: #cccccc;
      --text-muted: #888;
      --primary: #3794ff;
      --success: #4ec94e;
      --error: #f44747;
      --warning: #cca700;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      background: var(--bg);
      color: var(--text);
      overflow-x: hidden;
    }
    .container { display: flex; flex-direction: column; height: 100vh; }

    /* Header */
    .header {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 12px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--error);
      flex-shrink: 0;
    }
    .status-dot.connected { background: var(--success); }
    .status-dot.connecting { background: var(--warning); }
    .status-text { font-size: 11px; color: var(--text-muted); flex: 1; }

    /* Buttons */
    .btn {
      padding: 3px 10px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text);
      cursor: pointer; font-size: 11px; border-radius: 3px;
    }
    .btn:hover { background: #333; }
    .btn.primary { background: var(--primary); color: #fff; border-color: var(--primary); }

    /* Input area */
    .input-area {
      display: flex; gap: 4px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .input-area input {
      flex: 1;
      padding: 5px 8px;
      background: #3c3c3c;
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 3px;
      font-size: 12px;
      outline: none;
    }
    .input-area input:focus { border-color: var(--primary); }

    /* Log */
    .log { flex: 1; overflow-y: auto; padding: 8px 12px; }
    .entry { margin-bottom: 8px; padding: 6px 8px; border-radius: 4px; background: var(--surface); }
    .entry .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .entry .label { font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .entry .label.ok { color: var(--success); }
    .entry .label.fail { color: var(--error); }
    .entry .label.info { color: var(--primary); }
    .entry .label.perm { color: var(--warning); }
    .entry .label.diff { color: #c586c0; }
    .entry .time { font-size: 10px; color: var(--text-muted); }
    .entry .body { font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }
    .entry .body pre { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 11px; }
    .entry .body .diff-line-add { color: var(--success); }
    .entry .body .diff-line-remove { color: var(--error); }

    /* Permission prompt */
    .perm-prompt {
      padding: 8px 12px;
      background: var(--warning);
      color: #000;
      font-size: 12px;
    }
    .perm-prompt .perm-btns { margin-top: 6px; display: flex; gap: 4px; }
    .perm-prompt .perm-btns button {
      padding: 3px 12px; border: none; border-radius: 3px; cursor: pointer;
      font-size: 11px; font-weight: 600;
    }
    .perm-prompt .perm-btns .allow { background: #4ec94e; color: #000; }
    .perm-prompt .perm-btns .reject { background: #f44747; color: #fff; }
    .perm-prompt .perm-btns .always { background: #3794ff; color: #fff; }

    .empty { text-align: center; color: var(--text-muted); margin-top: 40px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="status-dot" id="statusDot"></span>
      <span class="status-text" id="statusText">disconnected</span>
      <button class="btn" id="connectBtn">Connect</button>
    </div>

    <div class="input-area">
      <input type="text" id="queryInput" placeholder="/read src/file.ts or /bash npm test ..." />
      <button class="btn primary" id="sendBtn">Send</button>
    </div>

    <div id="permPrompt" class="perm-prompt" style="display:none">
      <div id="permText"></div>
      <div class="perm-btns">
        <button class="allow" data-response="accept">Allow</button>
        <button class="always" data-response="always">Always Allow</button>
        <button class="reject" data-response="reject">Reject</button>
      </div>
    </div>

    <div class="log" id="log">
      <div class="empty">Connect to an MTC server to start.<br/>Run <code>mtc serve</code> in your terminal.</div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const log = document.getElementById('log');
    const queryInput = document.getElementById('queryInput');
    const sendBtn = document.getElementById('sendBtn');
    const connectBtn = document.getElementById('connectBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const permPrompt = document.getElementById('permPrompt');
    const permText = document.getElementById('permText');
    let pendingPermId = null;

    function addEntry(type, label, bodyEl, extraClass) {
      const empty = log.querySelector('.empty');
      if (empty) empty.remove();

      const entry = document.createElement('div');
      entry.className = 'entry';

      const headerRow = document.createElement('div');
      headerRow.className = 'header-row';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'label ' + (extraClass || 'info');
      labelSpan.textContent = type;
      headerRow.appendChild(labelSpan);

      const timeSpan = document.createElement('span');
      timeSpan.className = 'time';
      timeSpan.textContent = new Date().toLocaleTimeString();
      headerRow.appendChild(timeSpan);

      entry.appendChild(headerRow);

      const body = document.createElement('div');
      body.className = 'body';
      if (typeof bodyEl === 'string') {
        body.textContent = bodyEl;
      } else {
        body.appendChild(bodyEl);
      }
      entry.appendChild(body);

      log.appendChild(entry);
      entry.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    function addResult(id, data) {
      const type = data.success ? 'OK' : 'FAIL';
      const cls = data.success ? 'ok' : 'fail';
      const text = data.success
        ? (typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2))
        : data.error || 'Unknown error';
      addEntry(type, text, cls);
    }

    function addDiff(data) {
      const pre = document.createElement('pre');
      pre.textContent = 'Diff: ' + (data.filePath || 'unknown') + '\\n' + JSON.stringify(data, null, 2);
      addEntry('DIFF', pre, 'diff');
    }

    function addSuggestion(data) {
      addEntry('SUGGESTION', data.text || JSON.stringify(data), 'info');
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'connectionState':
          statusDot.className = 'status-dot ' + msg.state;
          statusText.textContent = msg.state;
          connectBtn.textContent = msg.state === 'connected' ? 'Disconnect' : 'Connect';
          break;

        case 'hello':
          addEntry('CONNECTED', 'Session: ' + (msg.sessionId || '') + '\\nClient: ' + (msg.clientId || ''), 'info');
          break;

        case 'result':
          addResult(msg.id, msg);
          break;

        case 'diff':
          addDiff(msg);
          break;

        case 'suggestion':
          addSuggestion(msg);
          break;

        case 'permission_request':
          pendingPermId = msg.id;
          permText.textContent = msg.description || 'Allow ' + msg.toolName + '?';
          permPrompt.style.display = 'block';
          break;

        case 'error':
          addEntry('ERROR', msg.message || 'Unknown error', 'fail');
          break;
      }
    });

    connectBtn.addEventListener('click', () => {
      if (statusText.textContent === 'connected') {
        vscode.postMessage({ command: 'disconnect' });
      } else {
        vscode.postMessage({ command: 'connect' });
      }
    });

    sendBtn.addEventListener('click', sendQuery);
    queryInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendQuery(); });

    function sendQuery() {
      const text = queryInput.value.trim();
      if (!text) return;
      addEntry('QUERY', text, 'info');
      vscode.postMessage({ command: 'query', text });
      queryInput.value = '';
    }

    document.querySelectorAll('.perm-prompt .perm-btns button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!pendingPermId) return;
        vscode.postMessage({ command: 'permission', requestId: pendingPermId, response: btn.dataset.response });
        pendingPermId = null;
        permPrompt.style.display = 'none';
      });
    });

    // Restore state
    const state = vscode.getState();
    if (state && state.logs) {
      log.innerHTML = state.logs;
    }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 64; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
