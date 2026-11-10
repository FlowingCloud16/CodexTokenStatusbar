import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { listTargets, connectTarget } from './cdp-session.mjs';
import { verifyClient } from './verify-client.mjs';
import { SessionIndex } from '../src/session-index.mjs';
import { VERSION } from '../src/version.mjs';

const { values } = parseArgs({ options: {
  action: { type: 'string', default: 'check' }, endpoint: { type: 'string' }, target: { type: 'string' },
  asar: { type: 'string' }, 'codex-directory': { type: 'string' }, seconds: { type: 'string', default: '20' },
} });
if (!['check', 'list', 'load', 'unload'].includes(values.action)) throw new Error('--action 仅支持 check、list、load、unload。');
const seconds = Number(values.seconds);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) throw new Error('--seconds 必须介于 1 到 60。');
if (values.action === 'check') {
  const result = await verifyClient(values.asar);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} else {
  const targets = await listTargets(values.endpoint);
  if (values.action === 'list') console.log(JSON.stringify({ targets: targets.map(target => ({ id: target.id, pathname: new URL(target.url).pathname })) }, null, 2));
  else {
    const target = targets.find(target => target.id === values.target);
    if (!target) throw new Error('请用 --target 明确选择已列出的 Codex 页面。');
    const session = await connectTarget(values.endpoint, target);
    let ownsRuntime = false;
    let index = null;
    let stopRequested = false;
    const requestStop = () => { stopRequested = true; };
    process.on('SIGINT', requestStop);
    process.on('SIGTERM', requestStop);
    try {
      const page = await session.evaluate(`({
        isCodex: window.codexWindowType === 'electron' && window.electronBridge?.windowType === 'electron',
        appVersion: window.electronBridge?.getSentryInitOptions?.()?.appVersion,
        existing: !!window.__codexTokenStatusbarRuntime || !!window.__codexTokenStatusbar
      })`);
      if (!page.isCodex) throw new Error('页面没有通过 Codex 桥接身份检查。');
      if (values.action === 'unload') {
        console.log(JSON.stringify({ unloaded: await session.evaluate(`(() => {
          const runtime = window.__codexTokenStatusbarRuntime;
          if (![${JSON.stringify(VERSION)}, '0.2.0-probe'].includes(runtime?.version)) return false;
          runtime.dispose(); return true;
        })()`) }));
      } else {
        if (page.existing) throw new Error('页面已有组件；请先用 unload 移除自己的实例。');
        const bundle = fs.readFileSync(new URL('../dist/statusbar.bundle.js', import.meta.url), 'utf8');
        const manifest = JSON.parse(fs.readFileSync(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
        if (manifest.version !== VERSION || crypto.createHash('sha256').update(bundle).digest('hex') !== manifest.bundleSha256) throw new Error('构建产物摘要不一致，请重新构建。');
        ownsRuntime = true;
        await session.evaluate(bundle);
        const codexDirectory = values['codex-directory'] ?? path.join(os.homedir(), '.codex');
        try { index = new SessionIndex(codexDirectory); } catch { /* 无本地索引时保留运行时通知采集能力。 */ }
        const started = Date.now();
        let lastIdentity = '';
        let lastReport = null;
        while (!stopRequested && Date.now() - started < seconds * 1000) {
          const report = await session.evaluate('window.__codexTokenStatusbarRuntime?.inspect() ?? null');
          if (!report) throw new Error('页面组件已消失。');
          const identity = report.identity;
          if (index && identity?.status === 'resolved') {
            let snapshot = null;
            try { snapshot = index.read(identity); } catch { /* 日志暂不可读时不阻断界面。 */ }
            if (snapshot) await session.evaluate(`window.__codexTokenStatusbarRuntime?.setLogSnapshot(${JSON.stringify(identity)}, ${JSON.stringify(snapshot)})`);
          }
          const signature = JSON.stringify(identity);
          if (signature !== lastIdentity) { console.log(JSON.stringify({ identity, mounted: report.ui?.mounted, phase: report.phase })); lastIdentity = signature; }
          lastReport = report;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        const validation = {
          mounted: lastReport?.ui?.mounted === true,
          identityResolved: lastReport?.identity?.status === 'resolved',
          usageAvailable: lastReport?.hasUsage === true,
        };
        console.log(JSON.stringify({ validation, result: lastReport, observationSeconds: seconds, automaticCleanup: true }, null, 2));
        if (!validation.mounted || !validation.identityResolved || !validation.usageAvailable) process.exitCode = 2;
      }
    } finally {
      process.removeListener('SIGINT', requestStop);
      process.removeListener('SIGTERM', requestStop);
      index?.close();
      if (ownsRuntime) {
        try { await session.evaluate(`(() => {
          const runtime = window.__codexTokenStatusbarRuntime;
          if (runtime?.version === ${JSON.stringify(VERSION)}) runtime.dispose();
          else if (!runtime && window.__codexTokenStatusbar?.version === ${JSON.stringify(VERSION)}) window.__codexTokenStatusbar.dispose();
        })()`); } catch { /* 页面关闭时临时对象同时消失。 */ }
      }
      session.close();
    }
  }
}
