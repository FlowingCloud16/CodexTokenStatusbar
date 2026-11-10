import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchHarnessBrowser } from './browser-harness.mjs';

const browser = await launchHarnessBrowser();
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 760 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  await page.setContent(`<!doctype html><html lang="en" class="dark" data-theme="dark"><head><style>
    html{color-scheme:dark;--font-sans:"Segoe UI",sans-serif;--text-sm:13px;--menu-font-size:13px;--color-text-primary:#f9f9f7;--color-text-secondary:#b2b2b0;--color-text-tertiary:#a5a5a3;--color-background-primary-ghost-hover:#ffffff14;--menu-background-color:#3f3f3d;--menu-box-shadow:0 0 0 .5px #ffffff15,0 8px 16px -4px #0003;--menu-separator-background-color:#ffffff15;--popover-radius:15px;--color-ring:#e0b09d}body{margin:0;background:#2d2d2b;color:var(--color-text-primary);font:430 14px/1.5 var(--font-sans)}main{max-width:840px;margin:30px auto;padding:0 24px}.notice{font-size:12px;color:var(--color-text-tertiary);margin-bottom:410px}.composer{border:1px solid #ffffff15;border-radius:22px;padding:16px;background:#3b3b39}.placeholder{color:var(--color-text-tertiary);margin:0 0 28px}.ComposerFooter-WlpjXt{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;min-width:0}.model{grid-column:1;grid-row:2;font:inherit;font-size:13px;line-height:18px;white-space:nowrap;color:var(--color-text-tertiary);border:1px solid transparent;border-radius:9999px;height:28px;padding:0 8px;background:transparent}.send{grid-column:3;grid-row:2;width:28px;height:28px;border:0;border-radius:50%;background:#f9f9f7;color:#2d2d2b;font:inherit;flex-shrink:0}
  </style></head><body><main><div class="notice">Standalone component preview · Sample data · Not a Codex window</div><div class="composer"><p class="placeholder">Ask anything, or describe a task...</p><div class="ComposerFooter-WlpjXt" data-composer-footer-responsive><button class="model" type="button">GPT-6 · High⌄</button><button class="send" aria-label="Send">↑</button></div></div></main></body></html>`);
  const source = fs.readFileSync(new URL('../src/statusbar.js', import.meta.url), 'utf8');
  await page.addScriptTag({ content: source });
  assert.equal(await page.evaluate(() => window.__codexTokenStatusbar.inspect().mounted), true);
  assert.equal(await page.locator('#codex-token-statusbar [data-value="speed"]').textContent(), '--');
  checks.push('英文组件正常挂载，未知生成速度显示 --');
  const state = {
    threadId: 'test-thread',
    total: { input_tokens: 331330, cached_input_tokens: 280576, output_tokens: 3627, reasoning_output_tokens: 1438, total_tokens: 334957 },
    cacheHitRate: 280576 / 331330 * 100,
    lastTurn: { usage: { input_tokens: 19500, cached_input_tokens: 16000, output_tokens: 1780, reasoning_output_tokens: 580, total_tokens: 21280 }, responseCount: 3, durationMs: 42000 },
    speed: { value: 178, estimated: true, durationMs: 10000, status: 'completed' },
    turnRate: { value: 1780 / 42, estimated: true, turnId: 'sample', durationMs: 42000 },
    endToEndSpeed: { value: 1780 / 42 },
  };
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), state);
  assert.equal(await page.locator('#codex-token-statusbar [data-value="total"]').textContent(), '335.0K');
  assert.equal(await page.locator('#codex-token-statusbar [data-value="cache"]').textContent(), '84.7%');
  checks.push('累计用量和缓存率显示正确，端到端吞吐未冒充生成速度');
  assert.equal(await page.locator('#codex-token-statusbar [data-label="speed"]').textContent(), 'Speed ');
  assert.equal(await page.locator('#codex-token-statusbar [data-value="speed"]').textContent(), '178.0 t/s');
  assert.match(await page.locator('#codex-token-statusbar button[data-action="toggle"]').getAttribute('title'), /Waiting and tool time are excluded/);
  assert.match(await page.locator('#codex-token-statusbar [data-detail="speed"]').textContent(), /Generation speed178.0 t\/s/);
  checks.push('主速度显示生成阶段速率，整轮吞吐不代替生成速度，口径放在悬停和详情中');
  const sampledState = { ...state, lastTurn: null,
    currentTurn: { id: 'sample', usage: state.lastTurn.usage, responseCount: 3 },
    turnRate: { ...state.turnRate, status: 'sampled', elapsedMs: 52000, sampleAgeMs: 10000 },
    speed: { ...state.speed, status: 'sampled', sampleAgeMs: 10000, held: true },
  };
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), sampledState);
  assert.equal(await page.locator('#codex-token-statusbar [data-label="speed"]').textContent(), 'Speed ');
  assert.match(await page.locator('#codex-token-statusbar button[data-action="toggle"]').getAttribute('title'), /Holding the last measurement/);
  assert.match(await page.locator('#codex-token-statusbar [data-detail="speed"]').textContent(), /Usage sample age10\.0 s ago/);
  assert.match(await page.locator('#codex-token-statusbar [data-detail="turn"]').textContent(), /Elapsed time52\.00 s/);
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), { ...sampledState, turnRate: { ...sampledState.turnRate, elapsedMs: 62000 }, speed: { ...sampledState.speed, sampleAgeMs: 20000 } });
  assert.equal(await page.locator('#codex-token-statusbar [data-value="speed"]').textContent(), '178.0 t/s');
  assert.match(await page.locator('#codex-token-statusbar button[data-action="toggle"]').getAttribute('aria-label'), /generation speed.*updated 20\.0 s ago/);
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), state);
  assert.doesNotMatch(await page.locator('#codex-token-statusbar [data-detail="speed"]').textContent(), /Usage sample age/);
  checks.push('生成速度与实际经过时间独立，等待时保留结果，完成后仍使用生成速度标签');
  const nativeStyle = await page.evaluate(() => {
    const button = document.getElementById('codex-token-statusbar').shadowRoot.querySelector('button');
    const native = document.querySelector('.model');
    const a = getComputedStyle(button), b = getComputedStyle(native);
    return { fontFamily: a.fontFamily === b.fontFamily, fontSize: a.fontSize === b.fontSize, height: a.height === b.height, lineHeight: a.lineHeight === b.lineHeight, borderRadius: a.borderRadius === b.borderRadius };
  });
  assert.ok(Object.values(nativeStyle).every(Boolean), JSON.stringify(nativeStyle));
  assert.match(await page.locator('#codex-token-statusbar button[data-action="toggle"]').getAttribute('aria-label'), /generation speed.*334,957 total tokens.*84\.7%/);
  checks.push('状态栏继承宿主字体，字号、行高、高度和圆角与原生工具栏一致，图标模式有完整无障碍说明');
  await page.addScriptTag({ content: source });
  assert.equal(await page.locator('#codex-token-statusbar').count(), 1);
  checks.push('重复加载保持单实例');
  await page.locator('#codex-token-statusbar button[data-action="toggle"]').click();
  assert.equal(await page.locator('#codex-token-statusbar button[data-action="toggle"]').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#codex-token-statusbar section').isVisible(), true);
  const panelBox = await page.locator('#codex-token-statusbar section').boundingBox();
  assert.ok(panelBox.y >= 0 && panelBox.y + panelBox.height <= 760);
  assert.match(await page.locator('#codex-token-statusbar section').textContent(), /Cached input \(included\)/);
  fs.mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../reports/component-preview.png', import.meta.url)), fullPage: true });
  await page.screenshot({ path: fileURLToPath(new URL('../reports/native-component-preview.png', import.meta.url)), fullPage: true });
  await page.evaluate(() => { document.documentElement.lang = 'zh-CN'; });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'zh');
  assert.equal(await page.locator('#codex-token-statusbar [data-label="speed"]').textContent(), '速度 ');
  assert.equal(await page.locator('#codex-token-statusbar [data-heading="scope"]').textContent(), '当前对话');
  assert.equal(await page.locator('#codex-token-statusbar section').getAttribute('aria-label'), 'Token 用量详情');
  assert.match(await page.locator('#codex-token-statusbar section').textContent(), /缓存输入（已包含）/);
  assert.match(await page.locator('#codex-token-statusbar [data-detail="note"]').textContent(), /排除等待和工具耗时/);
  assert.equal(await page.locator('#codex-token-statusbar button[data-action="toggle"]').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#codex-token-statusbar [data-value="total"]').textContent(), '335.0K');
  assert.equal(await page.evaluate(() => window.__codexTokenStatusbar.inspect().mountCount), 1);
  await page.screenshot({ path: fileURLToPath(new URL('../reports/chinese-component-preview-0-4-3.png', import.meta.url)), fullPage: true });
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), { ...sampledState, scopeKey: 'scope.current', noteKey: 'note.generationHeld' });
  assert.equal(await page.locator('#codex-token-statusbar [data-label="speed"]').textContent(), '速度 ');
  assert.match(await page.locator('#codex-token-statusbar button[data-action="toggle"]').getAttribute('title'), /保留上次测量值/);
  assert.match(await page.locator('#codex-token-statusbar [data-detail="turn"]').textContent(), /已用时间52\.00 秒/);
  assert.match(await page.locator('#codex-token-statusbar [data-detail="speed"]').textContent(), /距上次采样10\.0 秒前/);
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), { bridgeDisconnected: true, scopeKey: 'scope.reconnecting', noteKey: 'note.bridgeDisconnected' });
  assert.equal(await page.locator('#codex-token-statusbar [data-value="speed"]').textContent(), '正在重连…');
  assert.equal(await page.locator('#codex-token-statusbar [data-heading="scope"]').textContent(), '正在重新连接本地助手');
  assert.match(await page.locator('#codex-token-statusbar [data-detail="note"]').textContent(), /连接恢复/);
  checks.push('中文切换即时覆盖状态栏、详情、提示、无障碍及重连说明，保留用量和展开状态');
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), state);
  for (const locale of ['zh-TW', 'zh-Hans', 'ZH_cn', 'en-US', 'ja-JP', 'fr-FR', 'ko-KR', 'de-DE', '']) {
    const expected = /^zh/i.test(locale) ? 'zh' : 'en';
    await page.evaluate(value => { document.documentElement.lang = value; }, locale);
    await page.waitForFunction(value => window.__codexTokenStatusbar.inspect().language === value, expected);
    assert.equal(await page.locator('#codex-token-statusbar [data-label="speed"]').textContent(), expected === 'zh' ? '速度 ' : 'Speed ');
    assert.match(await page.locator('#codex-token-statusbar [data-detail="total"]').textContent(), expected === 'zh' ? /缓存输入（已包含）/ : /Cached input \(included\)/);
  }
  await page.evaluate(() => { document.documentElement.lang = 'en'; });
  checks.push('中文语言标识统一显示中文，日法韩德及未知语言回退英文，浏览器中文设置不影响 Codex 英文界面');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#codex-token-statusbar section').isVisible(), false);
  checks.push('详情面板可展开，并支持 Escape 关闭');
  await page.evaluate(() => {
    const composer = document.querySelector('.composer');
    composer.style.overflow = 'hidden';
    composer.style.transform = 'translateZ(0)';
  });
  await page.locator('#codex-token-statusbar button[data-action="toggle"]').click();
  const escapedClipping = await page.evaluate(() => {
    const host = document.getElementById('codex-token-statusbar');
    const panel = host.shadowRoot.querySelector('section');
    const box = panel.getBoundingClientRect();
    return panel.matches(':popover-open') && document.elementFromPoint(box.left + 20, box.top + 20) === host;
  });
  assert.equal(escapedClipping, true);
  await page.keyboard.press('Escape');
  checks.push('详情使用顶层弹出框，不受输入区 overflow 和 transform 裁切');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--menu-background-color', '#fafaf8');
    document.documentElement.style.setProperty('--color-text-primary', '#242422');
  });
  const themed = await page.evaluate(() => {
    const panel = document.getElementById('codex-token-statusbar').shadowRoot.querySelector('section');
    return { background: getComputedStyle(panel).backgroundColor, color: getComputedStyle(panel).color };
  });
  assert.deepEqual(themed, { background: 'rgb(250, 250, 248)', color: 'rgb(36, 36, 34)' });
  checks.push('详情面板实时沿用宿主菜单和文字颜色，主题变化无需重新注入');
  await page.evaluate(() => {
    const footer = document.querySelector('[data-composer-footer-responsive]');
    const replacement = footer.cloneNode(true);
    replacement.querySelector('#codex-token-statusbar')?.remove();
    footer.replaceWith(replacement);
  });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().mountCount === 2);
  assert.equal(await page.locator('#codex-token-statusbar').count(), 1);
  checks.push('宿主工具栏重建后自动重新挂载');
  await page.setViewportSize({ width: 430, height: 500 });
  // 视口更新与 ResizeObserver 回调分属不同阶段，等待组件完成实际窄窗布局。
  await page.waitForFunction(() => {
    const host = document.getElementById('codex-token-statusbar');
    const footer = document.querySelector('[data-composer-footer-responsive]');
    return footer?.getBoundingClientRect().width < 560 && host?.hasAttribute('data-compact');
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false);
  const visibleMetrics = await page.locator('#codex-token-statusbar').evaluate(host => [...host.shadowRoot.querySelectorAll('[data-metric]')].filter(el => el.getBoundingClientRect().width > 0).map(el => el.dataset.metric));
  if (visibleMetrics.length >= 2) assert.ok(visibleMetrics.includes('speed') && visibleMetrics.includes('cache'));
  await page.locator('#codex-token-statusbar button[data-action="toggle"]').click();
  assert.match(await page.locator('#codex-token-statusbar section').textContent(), /Cached input \(included\)/);
  await page.keyboard.press('Escape');
  checks.push('窄窗口测试没有产生横向滚动');
  await page.evaluate(() => {
    const first = document.querySelector('[data-composer-footer-responsive]');
    first.id = 'composer-a';
    const second = first.cloneNode(true);
    second.id = 'composer-b'; second.querySelector('#codex-token-statusbar')?.remove();
    first.parentElement.append(second);
    first.style.display = 'none';
  });
  await page.waitForFunction(() => document.getElementById('codex-token-statusbar')?.parentElement.id === 'composer-b');
  assert.equal(await page.locator('#codex-token-statusbar').isVisible(), true);
  assert.equal(await page.locator('#codex-token-statusbar [data-value="total"]').textContent(), '--');
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), state);
  for (let i = 0; i < 6; i++) {
    const active = i % 2 === 0 ? 'composer-a' : 'composer-b';
    await page.evaluate(id => {
      for (const footer of document.querySelectorAll('[data-composer-footer-responsive]')) footer.hidden = footer.id !== id;
      document.getElementById('composer-a').style.display = '';
    }, active);
    await page.waitForFunction(id => document.getElementById('codex-token-statusbar')?.parentElement.id === id, active);
    assert.equal(await page.locator('#codex-token-statusbar').count(), 1);
    assert.equal(await page.locator('#codex-token-statusbar').isVisible(), true);
  }
  checks.push('后台输入框保留时状态栏随当前可见输入框迁移，切换先清旧数据，反复切换只有一个实例');
  await page.evaluate(() => { document.querySelectorAll('[data-composer-footer-responsive]').forEach(el => { el.hidden = true; }); });
  await page.waitForFunction(() => !window.__codexTokenStatusbar.inspect().mounted);
  assert.equal(await page.locator('#codex-token-statusbar').count(), 0);
  await page.evaluate(() => { document.getElementById('composer-a').hidden = false; });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().mounted);
  assert.equal(await page.locator('#codex-token-statusbar').isVisible(), true);
  checks.push('离开所有输入框时移除状态栏，重新显示对话后自动恢复');
  await page.evaluate(() => window.__codexTokenStatusbar.dispose());
  assert.equal(await page.locator('#codex-token-statusbar').count(), 0);
  checks.push('卸载移除界面与实例');
  const result = { passed: checks.length, checks, scope: 'standalone-component-harness' };
  fs.writeFileSync(new URL('../reports/ui-checks.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
