import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { readNativeDescriptor, createNativeTransport } from './native-session.mjs';
import { createStatusbarManager } from './manager-core.mjs';
import { loadManagerArtifacts, createSnapshotSource } from './manager-artifacts.mjs';
import { createSettingsStore } from './settings-store.mjs';
import { VERSION } from '../src/version.mjs';

const { values } = parseArgs({ options: { descriptor: { type: 'string' }, 'run-directory': { type: 'string' }, 'backend-id': { type: 'string' } } });
if (!values.descriptor || !values['run-directory']) throw new Error('请指定原生桥接描述文件和运行目录。');
if (!/^[a-f0-9]{64}$/.test(values['backend-id'] ?? '')) throw new Error('原生后端构建标识无效。');
const runRoot = path.resolve(values['run-directory']);
fs.mkdirSync(runRoot, { recursive: true });
const statusPath = path.join(runRoot, 'status.json');
const stopPath = path.join(runRoot, 'stop.request');
const transport = createNativeTransport(readNativeDescriptor(values.descriptor));
const bridge = await transport.request({ action: 'ping' });
if (bridge.transport !== 'native-pipe' || bridge.phase !== 'ready') throw new Error('原生桥接尚未就绪。');
const artifacts = await loadManagerArtifacts();
const abort = new AbortController();
let stopping = false;
const requestStop = () => { stopping = true; abort.abort(); };
process.on('SIGINT', requestStop); process.on('SIGTERM', requestStop);
const manager = createStatusbarManager({ ...artifacts, endpoint: `native://${bridge.pid}`,
  ownerId: crypto.randomUUID(), discover: transport.discover, connect: transport.connect,
  settings: createSettingsStore(path.join(runRoot, 'settings.json')), signal: abort.signal,
  snapshots: createSnapshotSource(path.join(os.homedir(), '.codex')),
});
const persist = () => {
  const state = { ...manager.inspect(), pid: process.pid, targetPid: bridge.pid, version: VERSION,
    buildId: artifacts.manifest.buildId, backendId: values['backend-id'],
    transport: 'native-pipe', debugging: false, updatedAt: new Date().toISOString() };
  const temporary = `${statusPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, statusPath);
};
try {
  while (!stopping && !fs.existsSync(stopPath)) {
    await manager.tick(); persist();
    try { await sleep(500, undefined, { signal: abort.signal }); } catch { /* 停止时立即唤醒。 */ }
  }
} finally {
  await manager.stop(); persist();
  await transport.request({ action: 'close' }).catch(() => {});
  process.removeListener('SIGINT', requestStop); process.removeListener('SIGTERM', requestStop);
}
