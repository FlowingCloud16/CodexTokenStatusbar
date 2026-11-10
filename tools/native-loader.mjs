import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { createNativeTransport, readNativeDescriptor } from './native-session.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const action = process.argv[2] ?? 'status';
if (!['start', 'stop', 'status'].includes(action)) throw new Error('原生实验仅支持 start、stop、status。');
const runRoot = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'CodexTokenStatusbar', 'native-experiment');
const descriptorPath = path.join(runRoot, 'bridge.json');
const statusPath = path.join(runRoot, 'status.json');
const stopPath = path.join(runRoot, 'stop.request');
const backendId = crypto.createHash('sha256').update(['native/main-bridge.cjs', 'tools/native-loader.mjs',
  'tools/native-session.mjs', 'tools/native-worker.mjs'].map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n')).digest('hex');
const readJSON = filename => { try { return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };
const writeJSON = (filename, value) => { const temp = `${filename}.tmp`; fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(temp, filename); };
function liveStatus() {
  const status = readJSON(statusPath);
  if (!status || status.phase === 'stopped' || Date.now() - Date.parse(status.updatedAt) > 15000) return null;
  try { process.kill(status.pid, 0); return status; } catch { return null; }
}
async function findTarget() {
  const executable = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object { $_.ExecutablePath -like '*\\WindowsApps\\OpenAI.Codex_*\\app\\ChatGPT.exe' -and $_.CommandLine -notmatch '(?:^|\\s)--type(?:=|\\s)' -and $_.CommandLine -notmatch '--user-data-dir' } | ForEach-Object { [pscustomobject]@{ pid=$_.ProcessId; creation=$_.CreationDate.ToUniversalTime().ToString('o'); debugFlag=($_.CommandLine -match '--remote-debugging-') } }) | ConvertTo-Json -Compress`;
  const { stdout } = await exec(executable, ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000 });
  const parsed = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  const targets = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  if (targets.length !== 1) throw new Error('请先正常打开一个 Codex 实例；实验加载器不会重启 Codex。');
  return targets[0];
}
async function prepareBridge(target) {
  let existing;
  try { existing = readNativeDescriptor(descriptorPath); } catch { /* 首次加载没有描述文件。 */ }
  if (existing?.pid === target.pid && existing.creation === target.creation) {
    try {
      if ((await createNativeTransport(existing).request({ action: 'ping' })).phase === 'ready') return existing;
    } catch { /* 已停止的桥接会重新建立。 */ }
  }
  const descriptor = { schemaVersion: 1, pid: target.pid, creation: target.creation, targetHadDebugFlag: target.debugFlag,
    pipeName: `\\\\.\\pipe\\codex-token-statusbar-native-${crypto.randomUUID()}`, token: crypto.randomBytes(32).toString('hex') };
  const packaged = path.join(root, 'native', 'bin', 'native-probe.exe');
  const helper = fs.existsSync(packaged) ? packaged : path.join(root, '.native-build', 'probe', 'native-probe.exe');
  if (!fs.existsSync(helper)) throw new Error('请先构建原生探针组件。');
  const source = `const p=globalThis.process; const req=p.mainModule?.require?.bind(p.mainModule) ?? p.getBuiltinModule('module').createRequire(p.execPath); return req(${JSON.stringify(path.join(root, 'native', 'main-bridge.cjs'))}).start({pipeName:${JSON.stringify(descriptor.pipeName)},token:${JSON.stringify(descriptor.token)},electron:req('electron')});`;
  const scriptPath = path.join(runRoot, 'bootstrap.js');
  fs.writeFileSync(scriptPath, source, { mode: 0o600 });
  writeJSON(descriptorPath, descriptor);
  const { stdout } = await exec(helper, ['--pid', String(target.pid), '--script', scriptPath], { windowsHide: true, timeout: 8000 });
  const result = JSON.parse(stdout);
  if (!result.ok || !result.hookRemoved || !result.executedJavaScript || result.scriptResult?.ok !== true) {
    if (result.scriptStage === 10) throw new Error('This runtime needs a native ABI update. Codex has not been restarted.');
    throw new Error(`原生接入未成功，阶段：${result.scriptStage ?? 'unknown'}。`);
  }
  writeJSON(path.join(runRoot, 'probe-result.json'), result);
  const client = createNativeTransport(descriptor);
  for (let attempt = 0; attempt < 10; attempt++) {
    try { if ((await client.request({ action: 'ping' })).phase === 'ready') return descriptor; } catch { /* 等待本地管道建立。 */ }
    await sleep(100);
  }
  throw new Error('主进程桥接没有就绪。');
}
async function stopPreviousManager() {
  const filename = path.join(path.dirname(runRoot), 'run', 'manager.json');
  const descriptor = readJSON(filename);
  if (descriptor?.controlHost !== '127.0.0.1' || !Number.isInteger(descriptor.controlPort)
      || descriptor.controlPort < 1024 || descriptor.controlPort > 65535 || !/^[a-f0-9]{64}$/.test(descriptor.token ?? '')) return;
  const call = async (route, method = 'GET') => {
    try {
      const response = await fetch(`http://127.0.0.1:${descriptor.controlPort}${route}`, {
        method, headers: { Authorization: `Bearer ${descriptor.token}` }, signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) return null;
      const value = await response.json();
      return value.instanceId === descriptor.instanceId ? value : null;
    } catch { return null; }
  };
  if (!(await call('/status'))) return;
  if (!(await call('/stop', 'POST'))) throw new Error('旧状态栏管理器未接受卸载请求。');
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!(await call('/status'))) return;
    await sleep(200);
  }
  throw new Error('旧状态栏仍在卸载，请稍后重新加载原生实验版。');
}
async function start() {
  const target = await findTarget();
  const previous = liveStatus();
  if (previous?.targetPid === target.pid && previous.backendId === backendId && previous.phase === 'running') return previous;
  if (previous) await stop();
  fs.mkdirSync(runRoot, { recursive: true });
  if (fs.existsSync(stopPath)) fs.unlinkSync(stopPath);
  const descriptor = await prepareBridge(target);
  await stopPreviousManager();
  const oldSettings = path.join(path.dirname(runRoot), 'run', 'settings.json');
  if (!fs.existsSync(path.join(runRoot, 'settings.json')) && fs.existsSync(oldSettings)) fs.copyFileSync(oldSettings, path.join(runRoot, 'settings.json'));
  const logPath = path.join(runRoot, 'worker.log');
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > 1024 * 1024) fs.writeFileSync(logPath, '原生实验日志已轮换。\n');
  const log = fs.openSync(logPath, 'a');
  let child;
  try {
    child = spawn(process.execPath, [path.join(root, 'tools', 'native-worker.mjs'), '--descriptor', descriptorPath, '--run-directory', runRoot, '--backend-id', backendId],
      { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    child.unref();
  } finally { fs.closeSync(log); }
  let failed = false;
  child.on('error', () => { failed = true; });
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = liveStatus();
    if (status?.pid === child.pid && status.phase === 'running' && status.pages.some(page => page.mounted)) return status;
    if (failed || child.exitCode != null) break;
    await sleep(200);
  }
  // 提交停止请求，避免失败后留下无人管理的后台实例。
  fs.writeFileSync(stopPath, 'stop\n');
  await createNativeTransport(descriptor).request({ action: 'close' }).catch(() => {});
  throw new Error('原生状态栏没有成功挂载，请查看原生实验日志。');
}
async function stop() {
  if (fs.existsSync(runRoot)) fs.writeFileSync(stopPath, 'stop\n');
  for (let attempt = 0; attempt < 60 && liveStatus(); attempt++) await sleep(200);
  if (liveStatus()) throw new Error('原生状态栏仍在卸载，没有强行结束 Codex。');
  try { await createNativeTransport(readNativeDescriptor(descriptorPath)).request({ action: 'close' }); } catch { /* 已经退出的桥接无需再次关闭。 */ }
  return readJSON(statusPath) ?? { phase: 'stopped' };
}

try {
  const result = action === 'start' ? await start() : action === 'stop' ? await stop() : liveStatus() ?? { phase: 'not-running' };
  console.log(JSON.stringify(result));
} catch (error) { console.error(error.message); process.exitCode = 1; }
