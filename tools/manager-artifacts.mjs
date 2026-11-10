import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { profile } from './verify-client.mjs';
import { VERSION } from '../src/version.mjs';
import { SessionIndex } from '../src/session-index.mjs';

export async function loadManagerArtifacts(asarPath = profile.defaultAsarPath) {
  const manifest = JSON.parse(fs.readFileSync(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
  const bundle = fs.readFileSync(new URL('../dist/statusbar.bundle.js', import.meta.url), 'utf8');
  if (manifest.version !== VERSION ||
      !/^[a-f0-9]{64}$/.test(manifest.buildId ?? '') || crypto.createHash('sha256').update(bundle).digest('hex') !== manifest.bundleSha256) {
    throw new Error('状态栏构建产物或摘要不匹配，请先运行 npm run build。');
  }
  // 客户端版本与旧指纹仅作历史参考，不参与注入许可；仍校验状态栏自身产物。
  return { bundle, manifest };
}

export function createSnapshotSource(codexDirectory, { now = Date.now } = {}) {
  let index = null;
  let key = null;
  let retryAt = 0;
  const close = () => { index?.close(); index = null; key = null; };
  return {
    read(identity) {
      if (identity?.hostId !== 'local' || now() < retryAt) return null;
      try {
        const stat = fs.statSync(path.join(codexDirectory, 'state_5.sqlite'));
        const current = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
        if (index && current !== key) close();
        if (!index) { index = new SessionIndex(codexDirectory); key = current; }
        return index.read(identity);
      } catch { close(); retryAt = now() + 10000; return null; }
    },
    close,
  };
}
