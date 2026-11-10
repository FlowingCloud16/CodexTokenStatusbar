import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { RolloutReader } from '../src/rollout-reader.mjs';
import { summarizePageMessage } from '../src/runtime-events.mjs';

const { values } = parseArgs({ options: {
  endpoint: { type: 'string' }, target: { type: 'string' },
  inject: { type: 'boolean', default: false },
  pin: { type: 'boolean', default: false },
  file: { type: 'string' }, thread: { type: 'string' },
  seconds: { type: 'string', default: '20' },
} });
if (!values.endpoint || !/^http:\/\/127\.0\.0\.1:\d{1,5}\/?$/.test(values.endpoint)) {
  throw new Error('请用 --endpoint 明确指定已开放的 127.0.0.1 本地调试地址。此工具不会启动或重启客户端。');
}
if (values.inject && (!values.file || !values.thread)) throw new Error('注入需要 --file 和 --thread，确保用量归属明确。');
const duration = Number(values.seconds);
if (!Number.isFinite(duration) || duration < 1 || duration > 60) throw new Error('--seconds 必须介于 1 到 60。');
const endpoint = new URL(values.endpoint);
const targets = await fetch(new URL('/json/list', endpoint), { signal: AbortSignal.timeout(5000) }).then(response => {
  if (!response.ok) throw new Error(`调试端点返回 ${response.status}`);
  return response.json();
});
const eligible = targets.filter(target => target.type === 'page' && /^(app|file):/.test(target.url));
if (!values.target) {
  console.log(JSON.stringify({ targets: eligible.map(target => {
    const url = new URL(target.url);
    return { id: target.id, type: target.type, origin: url.origin, pathname: url.pathname };
  }), next: '请用 --target 明确选择 Codex 主界面。' }, null, 2));
  process.exit(0);
}
const target = eligible.find(item => item.id === values.target);
if (!target) throw new Error('指定目标不是已列出的本地应用页面。');
const socketURL = new URL(target.webSocketDebuggerUrl);
if (socketURL.protocol !== 'ws:' || socketURL.hostname !== '127.0.0.1' || socketURL.port !== endpoint.port) {
  throw new Error('调试 WebSocket 地址与所选本地端点不一致。');
}
const socket = new WebSocket(socketURL);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
const eventShapes = new Map();
socket.addEventListener('message', message => {
  const data = JSON.parse(String(message.data));
  if (data.id) {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    clearTimeout(job.timer);
    data.error ? job.reject(new Error(data.error.message)) : job.resolve(data.result);
  } else if (data.method === 'Runtime.bindingCalled' && data.params.name === '__ctsObserve') {
    // 只接收字段形状和事件类型，不保存消息正文、delta 文本或认证数据。
    try {
      const shape = JSON.parse(data.params.payload);
      if (typeof shape.type !== 'string' || shape.type.length > 120 || !Array.isArray(shape.keys)) return;
      const key = JSON.stringify({
        type: shape.type, keys: shape.keys.filter(x => typeof x === 'string').slice(0, 24),
        method: typeof shape.method === 'string' ? shape.method.slice(0, 120) : null,
        paramKeys: Array.isArray(shape.paramKeys) ? shape.paramKeys.filter(x => typeof x === 'string').slice(0, 24) : [],
      });
      if (eventShapes.size < 100 || eventShapes.has(key)) eventShapes.set(key, (eventShapes.get(key) ?? 0) + 1);
    } catch { /* 忽略不符合预期的诊断消息。 */ }
  }
});
socket.addEventListener('close', () => {
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error('调试连接已断开')); }
  pending.clear();
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`调试请求超时：${method}`)); }, 5000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error('页面探针执行失败；未打印异常正文以避免泄露页面内容。');
  return result.result.value;
}
let timer;
let ownsBar = false;
try {
  await call('Runtime.enable');
  const info = await evaluate(`({
    isCodex: window.electronBridge?.windowType === 'electron' && window.codexWindowType === 'electron',
    composerFound: !!document.querySelector('[data-composer-footer-responsive], .ComposerFooter-WlpjXt'),
    routeIdCandidate: location.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null,
    activeThreadVerified: false,
    alreadyInjected: !!window.__codexTokenStatusbar
  })`);
  console.log(JSON.stringify({ inspection: info }));
  if (!info.isCodex) throw new Error('所选页面未通过 Codex preload 桥接检查。');
  if (values.inject && info.alreadyInjected) throw new Error('页面已有状态栏，请先卸载旧实例，防止探针接管其他实例。');
  await call('Runtime.addBinding', { name: '__ctsObserve' });
  await evaluate(`(() => {
    const summarize = (${summarizePageMessage.toString()});
    window.__ctsMessageProbe = event => {
      const shape = summarize(event.data);
      if (shape) window.__ctsObserve(JSON.stringify({...shape, keys: shape.keys ?? []}));
    };
    window.addEventListener('message', window.__ctsMessageProbe);
  })()`);
  if (values.inject) {
    await evaluate(fs.readFileSync(new URL('../src/statusbar.js', import.meta.url), 'utf8'));
    ownsBar = true;
    const reader = new RolloutReader(values.file, { threadId: values.thread });
    async function update() {
      // /local/ 路由可能使用客户端别名；未验证映射时不能冒充当前对话。
      const snapshot = values.pin ? {
        ...reader.read(), scopeLabel: 'Pinned conversation (probe)',
        scopeKey: 'scope.pinned', noteKey: 'note.pinned',
        scopeNote: 'Pinned probe data. Matching to the active conversation has not been verified. Generation speed is unavailable.',
      } : {
        scopeLabel: 'Active conversation not verified',
        scopeKey: 'scope.unverified', noteKey: 'note.unverified',
        scopeNote: 'Waiting for a verified mapping between the active UI conversation and the rollout thread. No usage is attributed yet.',
      };
      await evaluate(`window.__codexTokenStatusbar?.setSnapshot(${JSON.stringify(snapshot)})`);
    }
    await update();
    let inFlight = false;
    timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try { await update(); } catch { clearInterval(timer); }
      finally { inFlight = false; }
    }, 500);
    console.log(JSON.stringify({ injected: await evaluate('window.__codexTokenStatusbar.inspect()') }));
  }
  await new Promise(resolve => {
    const done = () => { clearTimeout(waitTimer); process.removeListener('SIGINT', done); resolve(); };
    const waitTimer = setTimeout(done, duration * 1000);
    process.once('SIGINT', done);
  });
  console.log(JSON.stringify({ observedEventShapes: [...eventShapes].map(([shape, count]) => ({ ...JSON.parse(shape), count })) }, null, 2));
} finally {
  clearInterval(timer);
  if (socket.readyState === WebSocket.OPEN) {
    try {
      await evaluate(`(() => {
        if (window.__ctsMessageProbe) window.removeEventListener('message', window.__ctsMessageProbe);
        delete window.__ctsMessageProbe;
        ${ownsBar ? 'window.__codexTokenStatusbar?.dispose();' : ''}
      })()`);
      await call('Runtime.removeBinding', { name: '__ctsObserve' });
    } catch { /* 页面关闭时无需再清理页面内临时对象。 */ }
  }
  socket.close();
}
