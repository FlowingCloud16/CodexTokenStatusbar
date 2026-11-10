import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { launchHarnessBrowser } from './browser-harness.mjs';
import { createMetricsAccumulator } from '../src/metrics.mjs';

import { A, B, fixtureModule, fixtureHTML as html } from './client-fixture.mjs';
const server = http.createServer((request, response) => {
  if (request.url === '/assets/348410.792d1c9584.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(fixtureModule); }
  else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchHarnessBrowser();
const checks = [];
const update = (id, total, hostId = 'local') => ({ type: 'mcp-notification', hostId, method: 'thread/tokenUsage/updated', params: {
  threadId: id, turnId: B, tokenUsage: { total: { inputTokens: total - 10, cachedInputTokens: 80, outputTokens: 10, reasoningOutputTokens: 4, totalTokens: total }, last: { inputTokens: 100, cachedInputTokens: 80, outputTokens: 10, reasoningOutputTokens: 4, totalTokens: 110 } },
} });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!window.__fixture);
  const bundle = fs.readFileSync(new URL('../dist/statusbar.bundle.js', import.meta.url), 'utf8');
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => window.__codexTokenStatusbarRuntime?.inspect().identity?.status === 'resolved');
  assert.equal(await page.evaluate(() => window.__codexTokenStatusbarRuntime.inspect().identity.threadId), A);
  checks.push('完整构建产物通过缓存模块与既有 Provider 取得身份');
  await page.evaluate(message => window.__fixture.emit(message), update(A, 110));
  await page.waitForFunction(() => document.querySelector('#codex-token-statusbar')?.shadowRoot.querySelector('[data-value="total"]').textContent === '110');
  assert.equal(await page.locator('#codex-token-statusbar [data-value="cache"]').textContent(), '80.0%');
  checks.push('通知经适配器、计算层到英文状态栏');
  await page.evaluate(({ id }) => {
    const now = Date.now();
    const turn = { id: 'rate-fixture', coverage: 'complete', usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 }, startedAtMs: now - 11000, usageUpdatedAtMs: now - 1000,
      generationSpeed: { value: 100, durationMs: 2000, outputTokens: 200, sampledAtMs: now - 1000, estimated: true, turnId: 'rate-fixture' } };
    const snapshot = { threadId: id, total: turn.usage, currentTurn: turn, updatedAt: new Date(now + 1).toISOString() };
    if (!window.__codexTokenStatusbarRuntime.setLogSnapshot({ status: 'resolved', threadId: id, hostId: 'local' }, snapshot)) throw Error('采样快照未接受');
  }, { id: A });
  const beforeSamplingWait = await page.locator('#codex-token-statusbar [data-detail="turn"]').textContent();
  assert.equal(await page.locator('#codex-token-statusbar [data-value="speed"]').textContent(), '100.0 t/s');
  // 让真实轮询经过两个周期，验证耗时仍更新而生成速度不会随轮询降低。
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(await page.locator('#codex-token-statusbar [data-value="speed"]').textContent(), '100.0 t/s');
  assert.notEqual(await page.locator('#codex-token-statusbar [data-detail="turn"]').textContent(), beforeSamplingWait);
  assert.match(await page.locator('#codex-token-statusbar [data-detail="speed"]').textContent(), /Usage sample age/);
  await page.evaluate(({ id }) => {
    window.__codexTokenStatusbarRuntime.setLogSnapshot({ status: 'resolved', threadId: id, hostId: 'local' }, {
      threadId: id, total: { total_tokens: 300 }, currentTurn: null,
      lastTurn: { id: 'rate-fixture', coverage: 'complete', usage: { output_tokens: 200 }, durationMs: 15000,
        generationSpeed: { value: 100, durationMs: 2000, outputTokens: 200, sampledAtMs: Date.now() - 1000, estimated: true, turnId: 'rate-fixture' } },
      updatedAt: new Date().toISOString(),
    });
  }, { id: A });
  assert.equal(await page.locator('#codex-token-statusbar [data-label="speed"]').textContent(), 'Speed ');
  assert.equal(await page.locator('#codex-token-statusbar [data-value="speed"]').textContent(), '100.0 t/s');
  checks.push('整包真实轮询中生成速度保持、经过时间继续更新，完成后不切回整轮吞吐');
  await page.evaluate(() => { document.documentElement.lang = 'zh-CN'; });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'zh');
  assert.equal(await page.locator('#codex-token-statusbar [data-heading="scope"]').textContent(), '当前对话');
  assert.match(await page.locator('#codex-token-statusbar [data-detail="note"]').textContent(), /排除等待和工具耗时/);
  await page.evaluate(() => { document.documentElement.lang = 'ja-JP'; });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'en');
  assert.match(await page.locator('#codex-token-statusbar [data-detail="note"]').textContent(), /Waiting and tool execution are excluded/);
  checks.push('完整构建产物随客户端语言切换，模型提供的统计说明同步翻译，非中文回退英文');
  const accumulator = createMetricsAccumulator({ threadId: A });
  accumulator.consume({ type: 'session_meta', payload: { id: A, model_provider: 'openai' } });
  accumulator.consume({ type: 'turn_context', payload: { turn_id: B, model: 'gpt-6.1-sol' } });
  const pricedUsage = { input_tokens: 100000, cached_input_tokens: 80000, cache_write_input_tokens: 0, output_tokens: 2000, total_tokens: 102000 };
  accumulator.consume({ type: 'token_usage_record', payload: { thread_id: A, turn_id: B, response_id: 'priced-r1', usage: pricedUsage, thread_token_usage: pricedUsage, turn_token_usage: pricedUsage } });
  const pricedSnapshot = { ...accumulator.snapshot(), updatedAt: new Date(Date.now() + 1000).toISOString() };
  await page.evaluate(({ id, snapshot }) => {
    if (!window.__codexTokenStatusbarRuntime.setLogSnapshot({ status: 'resolved', threadId: id, hostId: 'local' }, snapshot)) throw Error('费用快照未接受');
  }, { id: A, snapshot: pricedSnapshot });
  assert.equal(await page.locator('#codex-token-statusbar [data-value="cost"]').textContent(), '$0.07');
  assert.equal(await page.evaluate(() => window.__codexTokenStatusbarRuntime.inspect().hasCost), true);
  await page.locator('#codex-token-statusbar [data-metric="cost"]').click();
  assert.equal(await page.locator('#codex-token-statusbar #cts-cost-page').isVisible(), true);
  await page.keyboard.press('Escape');
  checks.push('完整构建产物接收实际计算的日志费用，状态栏和费用页金额一致');
  await page.evaluate(message => window.__fixture.emit(message), update(B, 210));
  await page.evaluate(id => window.__fixture.switchCore(id), B);
  await page.waitForFunction(() => document.querySelector('#codex-token-statusbar')?.shadowRoot.querySelector('[data-value="total"]').textContent === '210');
  checks.push('后台对话更新不抢占绑定，切换后显示正确缓存');
  assert.equal(await page.locator('#codex-token-statusbar [data-value="cost"]').textContent(), '--');
  checks.push('切换对话后清除上一对话费用，运行时缺少逐响应证据时保持未知');
  const alias = `client-new-thread:${A}`;
  await page.evaluate(alias => window.__fixture.newAlias(alias), alias);
  await page.waitForFunction(() => window.__codexTokenStatusbarRuntime.inspect().identity.status === 'alias-unresolved');
  assert.equal(await page.locator('#codex-token-statusbar [data-value="total"]').textContent(), '--');
  await page.evaluate(({ alias, id }) => window.__fixture.bindAlias(alias, id), { alias, id: B });
  await page.waitForFunction(() => window.__codexTokenStatusbarRuntime.inspect().identity.threadId === '01a1ba45-994e-75f3-ac70-6be9853c67b8');
  checks.push('未分配别名保持未知，显式分配后绑定核心线程');
  await page.evaluate(id => window.__fixture.switchCore(id, 'remote'), B);
  await page.waitForFunction(() => window.__codexTokenStatusbarRuntime.inspect().identity.hostId === 'remote');
  assert.equal(await page.locator('#codex-token-statusbar [data-value="total"]').textContent(), '--');
  const stale = await page.evaluate(({ id }) => window.__codexTokenStatusbarRuntime.setLogSnapshot({ status: 'resolved', threadId: id, hostId: 'local' }, { threadId: id, total: { total_tokens: 999 } }), { id: B });
  assert.equal(stale, false);
  checks.push('多主机隔离，并拒绝切换前返回的日志快照');
  await page.addScriptTag({ content: bundle });
  assert.equal(await page.locator('#codex-token-statusbar').count(), 1);
  assert.equal(await page.evaluate(() => window.__fixture.inspect().listeners), 1);
  assert.equal(await page.locator('#codex-token-statusbar [data-value="speed"]').textContent(), '--');
  checks.push('整包重复加载保持一个实例，未知速度保持 --');
  await page.evaluate(() => window.__codexTokenStatusbarRuntime.dispose());
  assert.equal(await page.locator('#codex-token-statusbar').count(), 0);
  assert.equal(await page.evaluate(() => window.__fixture.inspect().listeners), 0);
  assert.equal(await page.evaluate(() => window.__fixture.inspect().deliveries), 2);
  checks.push('卸载移除组件和监听器，宿主消息照常分发');
  const result = { passed: checks.length, checks, scope: 'integrated-bundle-with-simulated-client-state' };
  fs.writeFileSync(new URL('../reports/integration-checks.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
