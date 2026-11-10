import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchHarnessBrowser } from './browser-harness.mjs';
import { createMetricsAccumulator } from '../src/metrics.mjs';

const checks = [];
function snapshot({ write = 0, ttl = false, partial = false, unknown = false } = {}) {
  const acc = createMetricsAccumulator();
  acc.consume({ type: 'session_meta', payload: { id: 'fixture', model_provider: 'openai' } });
  if (!unknown) acc.consume({ type: 'turn_context', payload: { turn_id: 't1', model: 'gpt-6.1-sol' } });
  acc.consume({ type: 'event_msg', payload: { type: 'task_started', turn_id: 't1', started_at: 100 } });
  const usage = { input_tokens: 100000, cached_input_tokens: 80000, cache_write_input_tokens: write, output_tokens: 2000, reasoning_output_tokens: 800, total_tokens: 102000 };
  if (ttl) usage.cache_write_input_tokens_details = { ttl_30m_tokens: write, ttl_12h_tokens: 0 };
  acc.consume({ type: 'token_usage_record', payload: { turn_id: 't1', response_id: 'r1', usage, thread_token_usage: partial ? { ...usage, input_tokens: 200000, total_tokens: 202000 } : usage, turn_token_usage: usage } });
  acc.consume({ type: 'event_msg', payload: { type: 'task_complete', turn_id: 't1', duration_ms: 47170 } });
  return { ...acc.snapshot(), turnRate: { value: 2000 / 47.17, estimated: true, status: 'completed' } };
}
const browser = await launchHarnessBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent([
    '<!doctype html><html lang="zh-CN"><head><style>',
    'html{color-scheme:dark;--font-sans:"Segoe UI",sans-serif;--text-sm:13px;--menu-font-size:13px;--color-text-primary:#f9f9f7;--color-text-secondary:#b2b2b0;--color-text-tertiary:#aaa9a6;--menu-background-color:#3f3f3d;--menu-separator-background-color:#ffffff15}',
    'body{margin:0;background:#2d2d2b;color:#f9f9f7;font:430 14px/1.5 var(--font-sans)}',
    'main{max-width:840px;margin:24px auto;padding:0 20px}.notice{color:#aaa9a6;font-size:12px;margin-bottom:440px}',
    '.composer{border:1px solid #ffffff15;border-radius:23px;background:#3b3b39;padding:16px 12px 10px}',
    '.placeholder{color:#aaa9a6;margin:0 0 28px}',
    '[data-composer-footer-responsive]{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;min-width:0}',
    '.model{grid-column:1;grid-row:2;white-space:nowrap;color:#aaa9a6;font:inherit;font-size:13px}',
    '.send{grid-column:3;grid-row:2;width:28px;height:28px;border:0;border-radius:50%}',
    '</style></head><body><main><div class="notice">独立组件验证 · 示例数据 · 非 Codex 窗口</div><div class="composer"><p class="placeholder">向 Codex 提问或描述任务…</p><div data-composer-footer-responsive><span class="model">GPT-6.1 Sol⌄</span><button class="send">↑</button></div></div></main></body></html>',
  ].join(''));
  await page.addScriptTag({ content: fs.readFileSync(new URL('../src/statusbar.js', import.meta.url), 'utf8') });
  const host = page.locator('#codex-token-statusbar');
  const main = host.locator('[data-action="toggle"]');
  const show = value => page.evaluate(state => window.__codexTokenStatusbar.setSnapshot(state), value);
  await show(snapshot());
  assert.equal(await host.locator('[data-value="cost"]').textContent(), '$0.07');
  assert.equal(await host.locator('[data-label="cost"]').textContent(), '费用 ');
  await host.locator('[data-metric="cost"]').click();
  assert.equal(await host.locator('#cts-cost-page').isVisible(), true);
  assert.match(await host.locator('[data-detail="cost-turn"]').innerText(), /最近已完成轮次.*0.0680/s);
  assert.match(await host.locator('[data-cost="reasons"]').innerText(), /按 Standard 估算/);
  assert.match(await main.getAttribute('aria-label'), /API 估算费用.*0.0680/);
  const desktop = await page.evaluate(() => window.__codexTokenStatusbar.desktopSnapshot());
  assert.equal(desktop.values.cost, '$0.07');
  assert.equal(desktop.cost.amount, '≈ $0.0680');
  assert.equal(desktop.cost.rows.length, 4);
  assert.match(desktop.cost.rates[0].heading, /gpt-6.1-sol/);
  assert.ok(desktop.cost.notes.some(note => /Standard/.test(note)));
  assert.equal('threadId' in desktop, false);
  checks.push('主窗口摘要复用真实费用计算、四项费用分解、模型单价与缺口说明，不额外暴露对话身份');
  checks.push('真实计算模块的费用快照显示到中文组件，费用点击直接展开对应页签');
  await host.locator('[data-cost="rates-title"]').click();
  assert.match(await host.locator('[data-cost="rates"]').innerText(), /gpt-6.1-sol.*Standard/s);
  // 相同用量轮询不会替换单价详情中的焦点节点，也不会关闭展开的单价。
  const before = await host.locator('details summary').evaluate(el => { window.__costSummaryNode = el; return el.parentElement.open; });
  await show(snapshot());
  assert.equal(before, true);
  assert.equal(await host.locator('details summary').evaluate(el => el === window.__costSummaryNode && el.parentElement.open), true);
  await host.locator('details summary').click();
  checks.push('单价与来源可查看，同样用量的刷新保留详情展开状态与节点');
  await host.locator('[data-tab="usage"]').click();
  assert.equal(await host.locator('#cts-usage-page').isVisible(), true);
  assert.match(await host.locator('[data-detail="total"]').innerText(), /缓存写入/);
  await host.locator('[data-tab="usage"]').press('ArrowRight');
  assert.equal(await host.locator('#cts-cost-page').isVisible(), true);
  checks.push('费用与用量页签支持鼠标和方向键，用量保留缓存写入字段');
  await show(snapshot({ write: 10000 }));
  assert.equal(await host.locator('[data-value="cost"]').textContent(), '$0.07–$0.10');
  assert.match(await host.locator('[data-cost="reasons"]').innerText(), /缓存写入期限未确认/);
  await show(snapshot({ write: 10000, ttl: true }));
  assert.equal(await host.locator('[data-value="cost"]').textContent(), '$0.07');
  await show(snapshot({ partial: true }));
  assert.equal(await host.locator('[data-value="cost"]').textContent(), '$0.07');
  assert.doesNotMatch(await host.locator('#cts-cost-page').innerText(), /\+\s*\?/);
  assert.match(await host.locator('[data-cost="reasons"]').innerText(), /显示已计价小计，另有未计价用量/);
  assert.match(await host.locator('[data-cost="reasons"]').innerText(), /历史覆盖不足/);
  await show(snapshot({ unknown: true }));
  assert.equal(await host.locator('[data-value="cost"]').textContent(), '--');
  checks.push('写入期限区间、完整费用、未覆盖历史与未知费用显示正确');
  const tiny = snapshot(); tiny.cost.total.amount = { minPicoUsd: '1', maxPicoUsd: '1' };
  await show(tiny);
  assert.equal(await host.locator('[data-value="cost"]').textContent(), '$0.00');
  assert.equal(await host.locator('[data-cost="amount"]').textContent(), '≈ < $0.0001');
  for (const [amount, expected] of [['0', '$0.00'], ['4999999999', '$0.00'], ['5000000000', '$0.01'], ['999999999999', '$1.00'], ['1234567890000000', '$1,234.57']]) {
    const value = snapshot(); value.cost.total.amount = { minPicoUsd: amount, maxPicoUsd: amount };
    await show(value);
    assert.equal(await host.locator('[data-value="cost"]').textContent(), expected);
  }
  const range = snapshot(); range.cost.total.amount = { minPicoUsd: '68100000000', maxPicoUsd: '68900000000' };
  await show(range);
  assert.equal(await host.locator('[data-value="cost"]').textContent(), '$0.07');
  assert.equal(await host.locator('[data-cost="amount"]').textContent(), '≈ $0.0681–$0.0689');
  assert.doesNotMatch(await main.innerText(), /≈/);
  checks.push('栏内费用固定两位小数，正确处理半美分进位、零值和千位；相同显示区间合并，详情保留精度，栏内无约等于');
  await show(snapshot());
  await page.screenshot({ path: fileURLToPath(new URL('../reports/api-cost-component-0-5-0.png', import.meta.url)), fullPage: true });
  for (const locale of ['en-US', 'ja-JP', 'zh-TW']) {
    await page.evaluate(lang => { document.documentElement.lang = lang; }, locale);
    await page.waitForFunction(expected => window.__codexTokenStatusbar.inspect().language === expected, locale === 'zh-TW' ? 'zh' : 'en');
    assert.equal(await host.locator('[data-tab="cost"]').textContent(), locale === 'zh-TW' ? '费用' : 'Cost');
    assert.equal(await host.locator('#cts-cost-page').isVisible(), true);
  }
  checks.push('费用页即时跟随中文切换，英文和其他语言均用英文，保留已选页签');
  let layouts = 0;
  for (const width of [320, 430, 736, 1040]) for (const locale of ['zh-CN', 'en-US']) for (const value of [snapshot(), snapshot({ write: 10000 }), snapshot({ partial: true })]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(lang => { document.documentElement.lang = lang; }, locale);
    await show(value);
    const geometry = await page.evaluate(() => {
      const host = document.getElementById('codex-token-statusbar'), root = host.shadowRoot;
      const rects = [...root.querySelectorAll('[data-metric]')].map(el => el.getBoundingClientRect()).filter(rect => rect.width > 0);
      return { overflow: document.documentElement.scrollWidth > innerWidth, overlap: rects.some((r,i) => i && r.left < rects[i-1].right - 1) };
    });
    assert.deepEqual(geometry, { overflow: false, overlap: false }, JSON.stringify({ width, locale }));
    layouts++;
  }
  checks.push(layouts + ' 个实际组件宽度、语言和费用状态组合无横向溢出或指标覆盖');
  await show({ bridgeDisconnected: true });
  assert.equal(await host.locator('[data-value="cost"]').textContent(), '--');
  assert.doesNotMatch(await host.locator('[data-cost="amount"]').textContent(), /0.0680/);
  await page.keyboard.press('Escape');
  assert.equal(await host.locator('section').isVisible(), false);
  assert.deepEqual(errors, []);
  checks.push('断线后清除旧费用，Escape 正常关闭，浏览器脚本无错误');
  const result = { passed: checks.length, layouts, checks, scope: 'cost-calculator-with-real-component-harness' };
  fs.writeFileSync(new URL('../reports/cost-ui-checks.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
