export function parseEndpoint(value) {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{1,5}\/?$/.test(value)) throw new Error('请明确指定已有的 127.0.0.1 本地 CDP 地址。');
  const url = new URL(value);
  if (Number(url.port) < 1 || Number(url.port) > 65535) throw new Error('本地端口无效。');
  return url;
}
export async function listTargets(value) {
  const endpoint = parseEndpoint(value);
  const response = await fetch(new URL('/json/list', endpoint), { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`CDP 页面列表读取失败：${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error('CDP 页面列表格式无效。');
  return targets.filter(target => target.type === 'page' && /^(app|file):/.test(target.url));
}
export async function connectTarget(value, target) {
  const endpoint = parseEndpoint(value);
  const socketURL = new URL(target.webSocketDebuggerUrl);
  if (socketURL.protocol !== 'ws:' || socketURL.hostname !== '127.0.0.1' || socketURL.port !== endpoint.port) throw new Error('页面调试地址与指定端点不一致。');
  const socket = new WebSocket(socketURL);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('CDP 连接超时。')); }, 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP 连接失败。')); }, { once: true });
  });
  let serial = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    let response;
    try { response = JSON.parse(String(event.data)); } catch { return; }
    const job = pending.get(response.id);
    if (!job) return;
    pending.delete(response.id); clearTimeout(job.timer);
    response.error ? job.reject(new Error('CDP 请求被拒绝。')) : job.resolve(response.result);
  });
  const failPending = () => {
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error('CDP 连接已关闭。')); }
    pending.clear();
  };
  socket.addEventListener('close', failPending);
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) { reject(new Error('CDP 连接不可用。')); return; }
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP 请求超时：${method}`)); }, 5000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return {
    async evaluate(expression) {
      const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error('页面脚本执行失败；未输出可能包含页面内容的异常正文。');
      return response.result.value;
    },
    async captureScreenshot(clip) {
      const response = await call('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
      return response.data;
    },
    close() { failPending(); socket.close(); },
  };
}
