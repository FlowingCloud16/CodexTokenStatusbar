import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEndpoint } from './cdp-session.mjs';
import { loadManagerArtifacts, createSnapshotSource } from './manager-artifacts.mjs';
import { createStatusbarManager } from './manager-core.mjs';
import { VERSION } from '../src/version.mjs';
import { createSettingsStore } from './settings-store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  worker: { type: 'boolean' }, endpoint: { type: 'string' }, 'control-port': { type: 'string' },
  asar: { type: 'string' }, 'codex-directory': { type: 'string' },
  json: { type: 'boolean' }, 'run-directory': { type: 'string' },
} });
const runRoot = path.resolve(values['run-directory'] ?? path.join(root, '.run'));
const descriptorPath = path.join(runRoot, 'manager.json');
const statePath = path.join(runRoot, 'status.json');
const logPath = path.join(runRoot, 'manager.log');
const action = positionals[0] ?? (values.worker ? 'run' : 'status');
if (!['start', 'stop', 'status', 'run'].includes(action) || positionals.length > 1) throw new Error('命令仅支持 start、stop、status、run。');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。');
const config = JSON.parse(fs.readFileSync(path.join(root, 'statusbar.config.json'), 'utf8'));
const settings = {
  endpoint: parseEndpoint(values.endpoint ?? config.endpoint).href.replace(/\/$/, ''),
  controlPort: Number(values['control-port'] ?? config.controlPort),
  asar: values.asar ?? config.asar,
  codexDirectory: values['codex-directory'] ?? config.codexDirectory ?? path.join(os.homedir(), '.codex'),
};
if (!Number.isInteger(settings.controlPort) || settings.controlPort < 1024 || settings.controlPort > 65535 || settings.controlPort === Number(new URL(settings.endpoint).port)) throw new Error('管理端口必须为 1024 至 65535，且不能与 CDP 端口相同。');

function readJSON(filename) { try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { return null; } }
function writeJSON(filename, data) {
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, filename); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function readDescriptor() {
  const descriptor = readJSON(descriptorPath);
  return descriptor?.controlHost === '127.0.0.1' && Number.isInteger(descriptor.controlPort) && descriptor.controlPort >= 1024 && descriptor.controlPort <= 65535 && /^[a-f0-9]{64}$/.test(descriptor.token ?? '') ? descriptor : null;
}
async function control(descriptor, route = '/status', method = 'GET') {
  if (!descriptor) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${descriptor.controlPort}${route}`, {
      method, headers: { Authorization: `Bearer ${descriptor.token}` }, signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result.instanceId === descriptor.instanceId ? result : null;
  } catch { return null; }
}
const phaseNames = {
  starting: '正在启动', running: '正在运行', 'waiting-for-page': '等待 Codex 主页面',
  'waiting-for-endpoint': '等待本地调试端点',
  stopping: '正在卸载', stopped: '已停止',
};
function printStatus(status) {
  if (values.json) { console.log(JSON.stringify(status ?? { phase: 'not-running', version: VERSION })); return; }
  console.log(JSON.stringify({
    状态: phaseNames[status?.phase] ?? '未运行', 版本: status?.version ?? VERSION,
    调试端点: status?.endpoint ?? settings.endpoint,
    已挂载页面: status?.pages?.filter(page => page.mounted).length ?? 0,
    已取得用量页面: status?.pages?.filter(page => page.hasUsage).length ?? 0,
    后台进程: status?.phase === 'stopped' ? null : status?.pid ?? null,
    暂不可达的卸载页面: status?.cleanupPending ?? 0,
    状态文件: statePath,
  }, null, 2));
}

async function runWorker() {
  if (await control(readDescriptor())) throw new Error('此项目的常驻管理器已经运行，请先停止已有实例。');
  fs.mkdirSync(runRoot, { recursive: true });
  const artifacts = await loadManagerArtifacts(settings.asar);
  const instanceId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const abort = new AbortController();
  let stopRequested = false;
  let manager;
  let lastWrite = 0;
  const descriptor = { instanceId, token, pid: process.pid, controlHost: '127.0.0.1', controlPort: settings.controlPort,
    endpoint: settings.endpoint, version: VERSION, startedAt: new Date().toISOString() };
  const status = () => ({ ...manager.inspect(), instanceId, pid: process.pid, version: VERSION, buildId: artifacts.manifest.buildId,
    startedAt: descriptor.startedAt, heartbeatAt: new Date().toISOString() });
  const persist = () => {
    const state = status();
    try {
      if (readDescriptor()?.instanceId === instanceId) writeJSON(statePath, state);
      lastWrite = Date.now();
    } catch { /* 状态文件暂时被占用时，HTTP 状态仍然可用。 */ }
  };
  const requestStop = () => { stopRequested = true; abort.abort(); };
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401); response.end('{}'); return; }
    if (request.method === 'GET' && request.url === '/status') { response.end(JSON.stringify(status())); return; }
    if (request.method === 'POST' && request.url === '/stop') {
      response.writeHead(202); response.end(JSON.stringify({ instanceId, stopping: true })); requestStop(); return;
    }
    response.writeHead(404); response.end('{}');
  });
  manager = createStatusbarManager({ ...artifacts, endpoint: settings.endpoint, ownerId: instanceId,
    settings: createSettingsStore(path.join(runRoot, 'settings.json')),
    signal: abort.signal,
    snapshots: createSnapshotSource(settings.codexDirectory), onChange: state => {
      persist();
      const event = state.events.at(-1);
      if (event) console.log(JSON.stringify(event));
    },
  });
  let listening = false;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(settings.controlPort, '127.0.0.1', resolve); });
    listening = true;
    server.on('error', requestStop);
    writeJSON(descriptorPath, descriptor);
    process.on('SIGINT', requestStop); process.on('SIGTERM', requestStop);
    persist();
    while (!stopRequested) {
      await manager.tick();
      if (Date.now() - lastWrite >= 5000) persist();
      if (manager.inspect().fatal) { stopRequested = true; break; }
      try { await sleep(500, undefined, { signal: abort.signal }); } catch { /* 停止请求会唤醒等待。 */ }
    }
  } finally {
    await manager.stop(); persist();
    process.removeListener('SIGINT', requestStop); process.removeListener('SIGTERM', requestStop);
    if (listening) await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
  }
}

async function startWorker() {
  const existing = await control(readDescriptor());
  if (existing) { if (!values.json) console.log('常驻管理器已经运行，没有创建重复实例。'); printStatus(existing); return; }
  fs.mkdirSync(runRoot, { recursive: true });
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > 1024 * 1024) fs.writeFileSync(logPath, '日志已轮换。\n');
  const log = fs.openSync(logPath, 'a');
  let child;
  try {
    const args = [fileURLToPath(import.meta.url), '--worker', '--endpoint', settings.endpoint, '--control-port', String(settings.controlPort), '--codex-directory', settings.codexDirectory];
    args.push('--run-directory', runRoot);
    if (settings.asar) args.push('--asar', settings.asar);
    child = spawn(process.execPath, args, { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    child.unref();
  } finally { fs.closeSync(log); }
  let spawnError = false;
  child.on('error', () => { spawnError = true; });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (spawnError || child.exitCode != null) break;
    await sleep(200);
    const current = await control(readDescriptor());
    if (current) { if (!values.json) console.log('常驻管理器已启动。它只连接已有调试端点，不启动 Codex。'); printStatus(current); return; }
  }
  throw new Error(`后台管理器未能启动。请查看 ${logPath}；管理端口也可能被其他程序占用。`);
}
async function stopWorker() {
  const descriptor = readDescriptor();
  if (!(await control(descriptor))) { if (!values.json) console.log('常驻管理器未运行。'); printStatus(null); return; }
  if (!(await control(descriptor, '/stop', 'POST'))) throw new Error('停止请求未被接受，没有终止其他进程。');
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(200);
    if (!(await control(descriptor))) { if (!values.json) console.log('已停止常驻管理器，并完成可连接页面的组件卸载。'); printStatus(readJSON(statePath)); return; }
  }
  throw new Error('管理器仍在清理连接，请稍后查看状态。');
}

try {
  if (action === 'run') await runWorker();
  else if (action === 'start') await startWorker();
  else if (action === 'stop') await stopWorker();
  else printStatus(await control(readDescriptor()));
} catch (error) { console.error(error.message); process.exitCode = 1; }
