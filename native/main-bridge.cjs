const net = require('node:net');
const crypto = require('node:crypto');

const KEY = '__codexTokenStatusbarNativeBridge';
const MAX_MESSAGE = 1024 * 1024;

function start({ pipeName, token, electron, host = globalThis }) {
  if (!/^\\\\\.\\pipe\\codex-token-statusbar-native-[a-f0-9-]{36}$/.test(pipeName)
      || !/^[a-f0-9]{64}$/.test(token)) throw new Error('原生桥接参数无效。');
  if (host[KEY]) {
    if (host[KEY].pipeName !== pipeName || host[KEY].token !== token) throw new Error('已有另一个原生桥接正在运行。');
    return host[KEY].inspect();
  }
  const expected = Buffer.from(token, 'hex');
  const sockets = new Set();
  const state = { phase: 'starting', pipeName, token, requests: 0 };
  function pages() {
    const result = new Map();
    for (const window of electron.BrowserWindow.getAllWindows()) {
      const contents = window.webContents;
      if (!contents || contents.isDestroyed?.()) continue;
      const url = contents.getURL();
      if (/^(app|file):/.test(url) && typeof contents.executeJavaScript === 'function') {
        result.set(String(contents.id), { contents, target: { id: String(contents.id), type: 'page', url } });
      }
    }
    return result;
  }
  const server = net.createServer(socket => {
    if (sockets.size >= 8) { socket.destroy(); return; }
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.setTimeout(7000, () => socket.destroy());
    let chunks = [], length = 0, accepted = false;
    socket.on('data', async chunk => {
      if (accepted) return;
      length += chunk.length;
      if (length > MAX_MESSAGE) { socket.destroy(); return; }
      chunks.push(chunk);
      if (!chunk.includes(10)) return;
      accepted = true;
      let request;
      const respond = value => {
        const data = JSON.stringify(value) + '\n';
        if (Buffer.byteLength(data) > MAX_MESSAGE) socket.end('{"ok":false,"error":"reply-too-large"}\n');
        else socket.end(data);
      };
      try {
        const input = Buffer.concat(chunks).toString('utf8'); chunks = [];
        if (input.indexOf('\n') !== input.length - 1) throw new Error('invalid-message');
        request = JSON.parse(input);
        if (!/^[a-f0-9]{64}$/.test(request.token ?? '')
            || !crypto.timingSafeEqual(expected, Buffer.from(request.token, 'hex'))) {
          respond({ ok: false, error: 'unauthorized' }); return;
        }
        state.requests++;
        if (request.action === 'ping') respond({ ok: true, value: state.inspect() });
        else if (request.action === 'list') respond({ ok: true, value: [...pages().values()].map(page => page.target) });
        else if (request.action === 'evaluate') {
          const page = pages().get(request.targetId);
          if (!page || typeof request.expression !== 'string' || request.expression.length > 512 * 1024) throw new Error('invalid-target-or-script');
          // 使用页面执行接口，既不连接 CDP，也不附加 webContents.debugger。
          const value = await page.contents.executeJavaScript(request.expression);
          respond({ ok: true, value });
        } else if (request.action === 'close') {
          respond({ ok: true, value: { stopped: true } });
          state.stop(socket);
        } else throw new Error('unknown-action');
      } catch {
        // 不向日志或外部进程输出可能包含聊天正文的页面异常。
        respond({ ok: false, error: 'native-request-failed' });
      }
    });
  });
  state.inspect = () => ({ phase: state.phase, pid: process.pid, requests: state.requests, transport: 'native-pipe', debugging: false });
  state.stop = except => {
    if (state.phase === 'stopped') return;
    state.phase = 'stopped';
    for (const socket of sockets) if (socket !== except) socket.destroy();
    server.close();
    if (host[KEY] === state) delete host[KEY];
  };
  server.on('error', error => { state.phase = 'error'; state.errorCode = error.code; });
  host[KEY] = state;
  server.listen(pipeName, () => { state.phase = 'ready'; });
  server.unref();
  return state.inspect();
}

module.exports = { start };
