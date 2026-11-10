import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { launchHarnessBrowser } from './browser-harness.mjs';
import { createMetricsAccumulator } from '../src/metrics.mjs';
import { A, B, fixtureModule, fixtureHTML } from './client-fixture.mjs';

const server = http.createServer((request, response) => {
  const module = request.url.startsWith('/assets/');
  response.setHeader('Content-Type', module ? 'text/javascript' : 'text/html; charset=utf-8');
  response.end(module ? fixtureModule : fixtureHTML);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchHarnessBrowser();
const checks = [], errors = [];
const accumulator = createMetricsAccumulator({ threadId: A });
const event = (type, extra, at) => accumulator.consume({ type: 'event_msg', timestamp: new Date(at).toISOString(), payload: { type, turn_id: B, ...extra } });
const item = (type, start, end) => event('item_completed', { item: { type }, started_at_ms: start, completed_at_ms: end }, end);
const usage = (input, output) => ({ input_tokens: input, cached_input_tokens: input * .8, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 0, total_tokens: input + output });
const count = (id, input, output, last, at) => accumulator.consume({ type: 'token_usage_record', timestamp: new Date(at).toISOString(), payload: {
  turn_id: B, response_id: id, thread_token_usage: usage(input, output), usage: usage(1000, last),
} });
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.__rateNow = 11000; Date.now = () => window.__rateNow; });
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html');
  await page.waitForFunction(() => !!window.__fixture);
  await page.addScriptTag({ content: fs.readFileSync(new URL('../dist/statusbar.bundle.js', import.meta.url), 'utf8') });
  await page.waitForFunction(() => window.__codexTokenStatusbarRuntime?.inspect().identity.status === 'resolved');
  const host = page.locator('#codex-token-statusbar'), speed = host.locator('[data-value="speed"]');
  const setLog = () => page.evaluate(({ id, snapshot }) => window.__codexTokenStatusbarRuntime.setLogSnapshot({ status: 'resolved', hostId: 'local', threadId: id }, snapshot), { id: A, snapshot: accumulator.snapshot() });
  const emit = (method, params, now) => page.evaluate(({ method, params, now }) => {
    window.__rateNow = now;
    window.__fixture.emit({ type: 'mcp-notification', hostId: 'local', method, params });
    window.__codexTokenStatusbarRuntime.inspect();
  }, { method, params: { threadId: A, ...params }, now });
  const update = (output, now) => emit('thread/tokenUsage/updated', { turnId: B, tokenUsage: { total: { inputTokens: output === 200 ? 1000 : 2000, outputTokens: output }, last: { inputTokens: 1000, outputTokens: output } } }, now);

  accumulator.consume({ type: 'session_meta', payload: { id: A } });
  event('task_started', {}, 1000); item('Reasoning', 1000, 3000); count('r1', 1000, 200, 200, 11000);
  await setLog(); assert.equal(await speed.textContent(), '100.0 t/s');
  await update(200, 11005); await page.waitForTimeout(550);
  assert.equal(await speed.textContent(), '100.0 t/s');
  checks.push('完整页面显示模型输出速度，重复实时通知和轮询不改变结果');

  await update(600, 21005);
  assert.equal(await host.locator('[data-value="total"]').textContent(), '2.6K');
  assert.equal(await speed.textContent(), '100.0 t/s');
  item('McpToolCall', 3000, 21000); await setLog();
  assert.equal(await speed.textContent(), '100.0 t/s');
  assert.match(await host.locator('button[data-action="toggle"]').getAttribute('title'), /Holding/);
  checks.push('实时累计领先时保留配套模型采样，18 秒工具等待不降低速度');

  item('AgentMessage', 21000, 23000); count('r2', 2000, 600, 400, 23000);
  await page.evaluate(() => { window.__rateNow = 23005; });
  await setLog(); assert.equal(await speed.textContent(), '106.1 t/s');
  assert.match(await host.locator('[data-detail="speed"]').textContent(), /Model output time4.00 s/);
  await emit('turn/completed', { turn: { id: B } }, 31000);
  assert.equal(await speed.textContent(), '106.1 t/s');
  event('task_complete', { duration_ms: 30000 }, 31000); await setLog();
  assert.equal(await speed.textContent(), '106.1 t/s');
  assert.equal(await host.locator('[data-label="speed"]').textContent(), 'Speed ');
  checks.push('新窗口按 0.35 平滑更新，完成后保留生成速度，不改成整轮吞吐');

  await emit('turn/started', { turn: { id: 'next-turn' } }, 32000);
  assert.equal(await speed.textContent(), 'Waiting…');
  assert.match(await host.locator('button[data-action="toggle"]').getAttribute('title'), /model-output timing/);
  await page.evaluate(() => { document.documentElement.lang = 'zh-CN'; });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'zh');
  assert.equal(await speed.textContent(), '等待采样');
  assert.match(await host.locator('[data-detail="note"]').textContent(), /模型输出计时/);
  await page.evaluate(() => { document.documentElement.lang = 'ja-JP'; });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'en');
  assert.equal(await speed.textContent(), 'Waiting…');
  checks.push('新轮次重新等待采样，中文跟随客户端，其他语言使用英文');

  let layouts = 0;
  for (const width of [320, 430, 736, 1040]) for (const language of ['zh-CN', 'en-US']) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(language => { document.documentElement.lang = language; }, language);
    await page.waitForTimeout(40);
    const geometry = await page.evaluate(() => {
      const root = document.getElementById('codex-token-statusbar').shadowRoot;
      const rects = [...root.querySelectorAll('[data-metric]')].map(item => item.getBoundingClientRect()).filter(rect => rect.width > 0);
      return { overflow: document.documentElement.scrollWidth > innerWidth, overlap: rects.some((rect, i) => i > 0 && rect.left < rects[i - 1].right - 1) };
    });
    assert.deepEqual(geometry, { overflow: false, overlap: false }); layouts++;
  }
  checks.push('8 个宽度和语言组合没有溢出或指标覆盖');
  await page.evaluate(id => window.__fixture.switchCore(id, 'remote'), B);
  await page.waitForFunction(() => window.__codexTokenStatusbarRuntime.inspect().identity.hostId === 'remote');
  assert.equal(await speed.textContent(), '--');
  assert.equal(await host.locator('[data-value="total"]').textContent(), '--');
  checks.push('切换主机和对话清除之前的速度');
  assert.deepEqual(errors, []);
  const result = { passed: checks.length, layouts, checks, errors, scope: 'model-output-generation-speed-ui' };
  fs.writeFileSync(new URL('../reports/generation-rate-ui-checks.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
