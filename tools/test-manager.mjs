import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchHarnessBrowser } from './browser-harness.mjs';
import { createStatusbarManager } from './manager-core.mjs';
import { createSettingsStore } from './settings-store.mjs';
import { loadManagerArtifacts } from './manager-artifacts.mjs';
import { A, B, fixtureModule, fixtureHTML } from './client-fixture.mjs';

const bundle = fs.readFileSync(new URL('../dist/statusbar.bundle.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
const profile = JSON.parse(fs.readFileSync(new URL('../client-profile.json', import.meta.url), 'utf8'));
let entryPath = profile.entry, appVersion = profile.appVersion, targetPath = '/index.html';
const server = http.createServer((request, response) => {
  const module = request.url === entryPath;
  response.setHeader('Content-Type', module ? 'text/javascript' : 'text/html; charset=utf-8');
  response.end(module ? fixtureModule.replace(profile.appVersion, appVersion) : fixtureHTML.replace(profile.entry, entryPath));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchHarnessBrowser();
const pages = new Map(), managers = [], checks = [];
const settingsFile = path.join(os.tmpdir(), `codex-statusbar-manager-settings-${crypto.randomUUID()}.json`);
let online = true, clock = Date.now();
async function newPage(id) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    window.__leaseOffset = 0;
    const original = performance.now.bind(performance);
    Object.defineProperty(performance, 'now', { value: () => original() + window.__leaseOffset });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => !!window.__fixture);
  pages.set(id, page); return page;
}
function create(ownerId) {
  const manager = createStatusbarManager({ endpoint: 'http://127.0.0.1:9223', ownerId, bundle, manifest,
    settings: createSettingsStore(settingsFile),
    now: () => clock,
    discover: async () => {
      if (!online) throw new Error('模拟端点断开');
      return [...pages.keys()].map(id => ({ id, url: 'app://codex' + targetPath }));
    },
    connect: async (_endpoint, target) => {
      if (!online || !pages.has(target.id)) throw new Error('模拟连接不可达');
      return {
        evaluate: expression => { if (!online) throw new Error('模拟连接中断'); return pages.get(target.id).evaluate(expression); },
        close() {},
      };
    },
    snapshots: {
      read(identity) {
        const input = identity.threadId === A ? 100 : 200;
        return { threadId: identity.threadId, total: { input_tokens: input, output_tokens: 10, cached_input_tokens: 80, total_tokens: input + 10 },
          cacheHitRate: 80 / input * 100, updatedAt: new Date().toISOString(), currentTurn: {
            id: 'fixture-turn', coverage: 'complete', startedAtMs: Date.now() - 2000,
            usage: { input_tokens: input, output_tokens: 10, total_tokens: input + 10 },
          } };
      }, close() {},
    },
  });
  managers.push(manager); return manager;
}
async function ready(manager, count) {
  for (let attempt = 0; attempt < 50; attempt++) {
    clock += 600; await manager.tick();
    if (manager.inspect().pages.filter(page => page.state === 'ready').length === count) return;
    await sleep(50);
  }
  throw new Error(`管理器未能就绪：${JSON.stringify(manager.inspect())}`);
}
const uiValue = (page, field) => page.locator(`#codex-token-statusbar [data-value="${field}"]`).textContent();
try {
  const artifacts = await loadManagerArtifacts(path.join(os.tmpdir(), 'codex-client-no-longer-installed.asar'));
  assert.equal(artifacts.manifest.buildId, manifest.buildId);
  checks.push('状态栏自身摘要正常即可启动，不依赖旧客户端归档仍存在或客户端文件指纹一致');
  const first = await newPage('page-a');
  const manager = create('manager-a');
  await ready(manager, 1);
  assert.equal(await uiValue(first, 'total'), '110');
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbarRuntime.inspect().bridge.ownerId), 'manager-a');
  checks.push('自动发现通过 Codex 桥接身份检查的页面，读取归属明确的用量');
  assert.equal(manager.inspect().desktop.values.total, '110');
  assert.equal(manager.inspect().desktop.values.cache, '80.0%');
  assert.equal(manager.inspect().desktop.values.cost, '--');
  assert.deepEqual(Object.keys(manager.inspect().desktop.values), ['speed', 'cache', 'total', 'cost']);
  assert.equal('identity' in manager.inspect().desktop, false);
  checks.push('主窗口摘要与状态栏共享格式化数值，缺价保持未知，不额外传递聊天正文或身份');
  await first.evaluate(() => { window.__savedFooter = document.querySelector('[data-composer-footer-responsive]'); window.__savedFooter.remove(); });
  await first.waitForFunction(() => !window.__codexTokenStatusbarRuntime.inspect().ui.mounted);
  await manager.tick();
  assert.equal(manager.inspect().pages[0].state, 'waiting-for-composer');
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbarRuntime.inspect().bridge.ownerId), 'manager-a');
  await first.evaluate(() => document.body.append(window.__savedFooter));
  await ready(manager, 1);
  assert.equal(await first.evaluate(() => window.__fixture.inspect().listeners), 1);
  checks.push('暂时没有输入框也执行并保留脚本注入，输入框出现后自动挂载，无重复监听器');
  await first.evaluate(() => { document.documentElement.lang = 'zh-CN'; });
  await first.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'zh');
  await manager.tick();
  assert.equal(manager.inspect().language, 'zh');
  assert.equal(manager.inspect().pages[0].language, 'zh');
  await first.evaluate(() => { document.documentElement.lang = 'de-DE'; });
  await first.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'en');
  await manager.tick();
  assert.equal(manager.inspect().language, 'en');
  checks.push('管理器把已挂载页面的实际显示语言传给加载器，非中文统一上报英文');

  for (const id of [B, A, B, A, B, A]) {
    await first.evaluate(id => window.__fixture.retainedComposer(id), id);
    // 旧响应在下一次定时轮询前到达，也不能写到新对话的可见输入框。
    const rejected = await first.evaluate(oldId => window.__codexTokenStatusbarRuntime.setLogSnapshot(
      { status: 'resolved', threadId: oldId, hostId: 'local' }, { threadId: oldId, total: { total_tokens: 999 } }, 'manager-a'), id === A ? B : A);
    assert.equal(rejected, false);
    await manager.tick();
    assert.equal(manager.inspect().pages[0].identity.threadId, id);
    assert.equal(await uiValue(first, 'total'), id === A ? '110' : '210');
    assert.equal(manager.inspect().desktop.values.total, id === A ? '110' : '210');
    assert.equal(await first.locator('#codex-token-statusbar').count(), 1);
    assert.equal(await first.locator('#codex-token-statusbar').isVisible(), true);
    assert.equal(await first.evaluate(() => {
      const host = document.getElementById('codex-token-statusbar');
      return [...document.querySelectorAll('[data-composer-footer-responsive]')].filter(el => el.getBoundingClientRect().height > 0).every(el => el === host.parentElement);
    }), true);
  }
  assert.equal(await first.evaluate(() => window.__fixture.inspect().listeners), 1);
  checks.push('同一页面保留多个对话输入框时连续切换，界面与身份同步迁移、日志按对话隔离，轮询前的旧写入被拒绝');

  await first.reload();
  await first.waitForFunction(() => !!window.__fixture);
  await ready(manager, 1);
  assert.equal(await uiValue(first, 'total'), '110');
  assert.ok(manager.inspect().events.some(event => event.type === 'restored-after-reload'));
  assert.equal(await first.evaluate(() => window.__fixture.inspect().listeners), 1);
  checks.push('页面刷新后自动重新加载，保持一个消息订阅');

  const second = await newPage('page-b');
  await second.evaluate(id => window.__fixture.switchCore(id), B);
  clock += 3000;
  await ready(manager, 2);
  assert.equal(await uiValue(first, 'total'), '110');
  assert.equal(await uiValue(second, 'total'), '210');
  checks.push('新增页面独立绑定对话，多个页面显示各自用量');
  // 独立浏览器上下文都可能报告焦点；在夹具中明确模拟两个原生窗口的焦点交接。
  await first.evaluate(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false }));
  await second.evaluate(() => { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }); window.dispatchEvent(new Event('focus')); });
  await manager.tick();
  assert.equal(manager.inspect().desktop.values.total, '210');
  await new Promise(resolve => setTimeout(resolve, 10));
  await second.evaluate(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false }));
  await first.evaluate(() => { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }); window.dispatchEvent(new Event('focus')); });
  await manager.tick();
  assert.equal(manager.inspect().desktop.values.total, '110');
  checks.push('多窗口时主窗口摘要按最近焦点证据选择对话，加载器获取焦点后保留最近活动来源');

  await first.locator('#codex-token-statusbar [data-action="toggle"]').click();
  await first.locator('#codex-token-statusbar [data-tab="settings"]').click();
  await first.locator('#codex-token-statusbar [data-layout-option="separate"]').click();
  await manager.tick();
  assert.equal(JSON.parse(fs.readFileSync(settingsFile)).layout, 'separate');
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbar.inspect().settingsChange), null);
  assert.equal(await second.evaluate(() => window.__codexTokenStatusbar.inspect().layout), 'separate');
  checks.push('状态栏设置经持有租约的管理器保存至磁盘，同步到其他页面并确认保存');
  createSettingsStore(settingsFile).save('icon');
  await manager.tick();
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbar.inspect().layout), 'icon');
  assert.equal(await second.evaluate(() => window.__codexTokenStatusbar.inspect().layout), 'icon');
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbarRuntime.setSettings({ layout: 'adaptive' }, null, 'other-owner')), false);
  await first.reload(); await first.waitForFunction(() => !!window.__fixture); await ready(manager, 2);
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbar.inspect().layout), 'icon');
  checks.push('加载器写入同一设置文件后页面即时同步，刷新仍恢复布局，其他租约不能覆盖');
  createSettingsStore(settingsFile).save('adaptive'); await manager.tick();

  const competing = create('manager-b');
  await competing.tick();
  assert.ok(competing.inspect().pages.every(page => page.state === 'owned-by-another-manager'));
  await competing.stop();
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbarRuntime.inspect().bridge.ownerId), 'manager-a');
  checks.push('有效租约不能被另一实例抢占，停止另一实例不会卸载当前组件');

  await first.evaluate(() => { window.__priorRuntime = window.__codexTokenStatusbarRuntime; });
  online = false; clock += 3000; await manager.tick();
  assert.equal(manager.inspect().desktop, null);
  await first.evaluate(() => { window.__leaseOffset += 11000; });
  await first.waitForFunction(() => document.getElementById('codex-token-statusbar')?.shadowRoot.querySelector('[data-value="speed"]').textContent === 'Reconnecting…');
  assert.equal(await uiValue(first, 'total'), '--');
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbarRuntime.inspect().hasUsage), false);
  checks.push('调试连接中断且租约过期后显示重连提示，暂停旧用量');

  online = true; clock += 20000; await ready(manager, 2);
  assert.equal(await uiValue(first, 'total'), '110');
  assert.equal(await first.evaluate(() => window.__priorRuntime === window.__codexTokenStatusbarRuntime), true);
  checks.push('连接恢复后续租现有组件并恢复统计，不重复插入界面');

  for (const page of pages.values()) await page.evaluate(() => { window.__leaseOffset += 11000; });
  const replacement = create('manager-replacement');
  await ready(replacement, 2);
  await manager.stop();
  assert.equal(await first.evaluate(() => window.__codexTokenStatusbarRuntime.inspect().bridge.ownerId), 'manager-replacement');
  const staleWrite = await first.evaluate(id => window.__codexTokenStatusbarRuntime.setLogSnapshot(
    { status: 'resolved', threadId: id, hostId: 'local' }, { threadId: id, total: { total_tokens: 999 } }, 'manager-a'), A);
  assert.equal(staleWrite, false);
  checks.push('旧实例失联后可由新实例接管，旧实例的写入和清理不影响新所有者');

  entryPath = '/assets/updated-client.unknown.js'; appVersion = '99.9999.12345'; targetPath = '/updated-main.html';
  for (const page of pages.values()) { await page.reload(); await page.waitForFunction(() => !!window.__fixture); }
  clock += 3000; await ready(replacement, 2);
  assert.equal(replacement.inspect().fatal, false);
  assert.equal(replacement.inspect().phase, 'running');
  assert.equal(await uiValue(first, 'total'), '110');
  checks.push('未知客户端版本、改名后的脚本入口和页面地址仍照常注入，刷新后自动恢复统计');

  await first.evaluate(() => { window.__codexTokenStatusbarRuntime.dispose(); document.querySelector('script[type="module"]').remove(); });
  await replacement.tick();
  await first.waitForFunction(() => window.__codexTokenStatusbarRuntime?.inspect().phase === 'adapter-unavailable');
  await replacement.tick();
  assert.equal(await first.locator('#codex-token-statusbar').count(), 1);
  assert.equal(await uiValue(first, 'total'), '--');
  assert.equal(replacement.inspect().pages.find(page => page.id === 'page-a').state, 'adapter-unavailable');
  assert.equal(await second.locator('#codex-token-statusbar').count(), 1);
  checks.push('未知内部接口暂不可用时保留已注入界面，清空无证据数值，不卸载其他页面');
  await first.evaluate(src => { const script = document.createElement('script'); script.type = 'module'; script.src = src; document.head.append(script); }, entryPath);
  await first.waitForFunction(() => window.__codexTokenStatusbarRuntime?.inspect().identity?.status === 'resolved', null, { timeout: 8000 });
  await ready(replacement, 2);
  checks.push('模块入口恢复后由已注入组件自动重连，不需要重新加载或重启客户端');

  await first.evaluate(() => { window.codexWindowType = 'other'; });
  await replacement.tick();
  assert.equal(await first.locator('#codex-token-statusbar').count(), 0);
  assert.equal(replacement.inspect().pages.find(page => page.id === 'page-a').state, 'not-codex-page');
  await first.evaluate(() => { window.codexWindowType = 'electron'; });
  await ready(replacement, 2);
  checks.push('解除版本限制后仍核对实际 Codex 桥接，非 Codex 页面不会注入');

  for (const page of pages.values()) await page.evaluate(() => { window.__leaseOffset += 11000; });
  const finalManager = create('manager-final');
  await ready(finalManager, 2);
  await finalManager.stop();
  for (const page of pages.values()) {
    assert.equal(await page.locator('#codex-token-statusbar').count(), 0);
    assert.equal(await page.evaluate(() => window.__fixture.inspect().listeners), 0);
  }
  assert.equal(finalManager.inspect().cleanupPending, 0);
  assert.ok(finalManager.inspect().pages.every(page => !page.mounted && !page.hasUsage));
  checks.push('显式卸载移除所有自有页面组件、监听器及后台连接');

  const result = { passed: checks.length, checks, scope: 'manager-with-real-browser-and-simulated-client-transport' };
  fs.writeFileSync(new URL('../reports/manager-checks.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  online = true;
  for (const manager of managers) await manager.stop();
  if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile);
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
