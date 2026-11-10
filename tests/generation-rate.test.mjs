import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationRate } from '../src/generation-rate.mjs';
import { createMetricsAccumulator } from '../src/metrics.mjs';
import { createRuntimeModel } from '../src/runtime-model.mjs';

const threadId = '11111111-2222-3333-4444-555555555555';
const identity = { status: 'resolved', hostId: 'local', threadId };
const usage = output => ({ input_tokens: 100, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 0, total_tokens: 100 + output });
const event = (type, extra = {}, at = 1000) => ({ type: 'event_msg', timestamp: new Date(at).toISOString(), payload: { type, turn_id: 'a', ...extra } });
const item = (type, start, end, extra = {}) => event('item_completed', { item: { type }, started_at_ms: start, completed_at_ms: end, ...extra }, end);
const count = (output, extra = {}, at = 11000) => ({ type: 'token_usage_record', timestamp: new Date(at).toISOString(), payload: { turn_id: 'a', response_id: 'r1', usage: usage(output), thread_token_usage: usage(output), ...extra } });
const fixture = () => { const acc = createMetricsAccumulator({ threadId }); acc.consume({ type: 'session_meta', payload: { id: threadId } }); acc.consume(event('task_started')); return acc; };

test('生成速度只计算模型输出窗口，30 秒工具时间不进入 10 秒分母', () => {
  const acc = fixture();
  acc.consume(item('Reasoning', 1000, 6000));
  acc.consume(item('McpToolCall', 6000, 36000));
  acc.consume(item('AgentMessage', 36000, 41000));
  acc.consume(count(1000));
  const speed = acc.snapshot().currentTurn.generationSpeed;
  assert.equal(speed.value, 100);
  assert.equal(speed.durationMs, 10000);
  assert.equal(speed.outputTokens, 1000);
  acc.consume(event('task_complete', { duration_ms: 40000 }, 41000));
  assert.equal(acc.snapshot().lastTurn.generationSpeed.value, 100);
  assert.equal(acc.snapshot().endToEndSpeed.value, 25);
});

test('重叠、相邻和重复输出窗口合并，推理不重复计入 token', () => {
  const acc = fixture();
  acc.consume(item('Reasoning', 1000, 6000));
  acc.consume(item('AgentMessage', 5000, 11000));
  acc.consume(item('AgentMessage', 5000, 11000));
  acc.consume(count(1000, { usage: { ...usage(1000), reasoning_output_tokens: 400 } }));
  const speed = acc.snapshot().currentTurn.generationSpeed;
  assert.equal(speed.durationMs, 10000);
  assert.equal(speed.value, 100);
  assert.equal(speed.outputTokens, 1000);
});

test('采用参考项目的 0.35 指数平滑，重复采样不重复平滑', () => {
  const rate = createGenerationRate('a'); rate.begin();
  rate.observeItem('Reasoning', 1000, 11000, 11000); rate.update(1000, 11000);
  assert.equal(rate.snapshot().value, 100);
  rate.update(2000, 12000);
  assert.equal(rate.snapshot().rawValue, 200);
  assert.equal(rate.snapshot().value, 135);
  rate.update(2000, 13000); rate.observeItem('Reasoning', 1000, 11000, 14000);
  assert.equal(rate.snapshot().value, 135);
  assert.equal(rate.snapshot().sampleCount, 2);
});

test('工具期间保留数值，结束后固定，下一轮重新采样并清除旧平滑值', () => {
  const acc = fixture(); acc.consume(item('AgentMessage', 1000, 11000)); acc.consume(count(1000));
  acc.consume(item('CommandExecution', 11000, 61000));
  assert.equal(acc.snapshot().currentTurn.generationSpeed.value, 100);
  assert.equal(acc.snapshot().currentTurn.generationSpeed.held, true);
  acc.consume(event('task_complete', { duration_ms: 60000 }, 61000));
  assert.equal(acc.snapshot().lastTurn.generationSpeed.value, 100);
  assert.equal(acc.snapshot().lastTurn.generationSpeed.held, false);
  acc.consume(event('task_started', { turn_id: 'b' }, 62000));
  assert.equal(acc.snapshot().currentTurn.generationSpeed, null);
  acc.consume(item('AgentMessage', 62000, 64000, { turn_id: 'b' }));
  acc.consume(count(1400, { turn_id: 'b', response_id: 'r2', usage: usage(400) }, 64000));
  assert.equal(acc.snapshot().currentTurn.generationSpeed.value, 200);
});

test('缺少轮次开始、模型计时或有效输出时不回退到整轮速度', () => {
  const acc = createMetricsAccumulator({ threadId });
  acc.consume(item('Reasoning', 1000, 11000)); acc.consume(count(1000));
  assert.equal(acc.snapshot().currentTurn.generationSpeed, null);
  const rate = createGenerationRate('a'); rate.begin(); rate.update(1000, 11000);
  for (const [start, end] of [[11000, 1000], [1000, 1000], [1000, 601001], [null, 11000], [-1, 11000]]) rate.observeItem('Reasoning', start, end, 11000);
  assert.equal(rate.snapshot(), null);
  rate.observeItem('AgentMessage', 1000, 1001, 1001);
  assert.equal(rate.snapshot(), null);
});

test('兼容旧 token_count，现代与旧载体重复不会使生成速度翻倍', () => {
  const acc = fixture(); acc.consume(item('Reasoning', 1000, 11000));
  const legacy = event('token_count', { info: { total_token_usage: usage(1000), last_token_usage: usage(1000) } }, 11000);
  acc.consume(legacy); assert.equal(acc.snapshot().currentTurn.generationSpeed.value, 100);
  acc.consume(count(1000)); acc.consume(legacy); acc.consume(count(1000));
  assert.equal(acc.snapshot().currentTurn.generationSpeed.value, 100);
  assert.equal(acc.snapshot().currentTurn.generationSpeed.sampleCount, 1);
});

test('线程累计误填为轮次用量时，生成速度使用本轮差值', () => {
  const acc = createMetricsAccumulator({ threadId });
  acc.consume(count(10000, { turn_id: 'previous' }));
  acc.consume(event('task_started'));
  acc.consume(item('AgentMessage', 1000, 11000));
  acc.consume(count(11000, { usage: usage(1000), turn_token_usage: usage(11000) }));
  assert.equal(acc.snapshot().currentTurn.generationSpeed.value, 100);
  assert.equal(acc.snapshot().currentTurn.generationSpeed.outputTokens, 1000);
});

test('累计重置清除速度，中断后保留本轮结果且不被迟到用量重新打开', () => {
  const acc = fixture(); acc.consume(item('AgentMessage', 1000, 11000)); acc.consume(count(1000));
  acc.consume(event('turn_aborted', {}, 12000)); acc.consume(count(1000));
  assert.equal(acc.snapshot().currentTurn, null);
  assert.equal(acc.snapshot().lastTurn.generationSpeed.value, 100);
  assert.equal(acc.snapshot().lastTurn.generationSpeed.status, 'aborted');
  acc.consume(count(20));
  assert.equal(acc.snapshot().lastTurn.generationSpeed, null);
});

test('实时累计领先时保留日志模型窗口，切换对话清除速度', () => {
  const acc = fixture(); acc.consume(item('Reasoning', 1000, 11000)); acc.consume(count(1000));
  let now = 12000;
  const model = createRuntimeModel({ now: () => now }); model.setIdentity(identity); model.setLogSnapshot(identity, acc.snapshot());
  assert.equal(model.snapshot().speed.value, 100);
  now = 22000;
  model.consume({ type: 'mcp-notification', hostId: 'local', method: 'thread/tokenUsage/updated', params: { threadId, turnId: 'a', tokenUsage: { total: { inputTokens: 200, outputTokens: 2000 }, last: { inputTokens: 100, outputTokens: 1000 } } } });
  assert.equal(model.snapshot().speed.value, 100);
  assert.equal(model.snapshot().speed.outputTokens, 1000);
  assert.equal(model.snapshot().total.output_tokens, 2000);
  model.setIdentity({ ...identity, threadId: '11111111-2222-3333-4444-555555555556' });
  assert.equal(model.snapshot().speed, null);
});

test('压缩使输入累计下降时保留生成速度，只有输出重置才使其失效', () => {
  const acc = fixture(); acc.consume(item('Reasoning', 1000, 11000)); acc.consume(count(1000));
  const before = acc.snapshot();
  const compacted = { ...usage(1200), input_tokens: 50, total_tokens: 1250 };
  acc.consume(count(1200, { response_id: 'r2', usage: usage(200), thread_token_usage: compacted }, 12000));
  assert.equal(acc.snapshot().currentTurn.generationSpeed.outputTokens, 1200);
  assert.equal(acc.snapshot().currentTurn.generationSpeed.value, 107);
  const model = createRuntimeModel({ now: () => 12000 }); model.setIdentity(identity); model.setLogSnapshot(identity, before);
  model.consume({ type: 'mcp-notification', hostId: 'local', method: 'thread/tokenUsage/updated', params: { threadId, turnId: 'a', tokenUsage: { total: { inputTokens: 50, outputTokens: 1200 }, last: { inputTokens: 50, outputTokens: 200 } } } });
  assert.equal(model.snapshot().speed.value, 100);
});

test('首轮没有已知累计基线时，百万历史输出不冒充本轮的一千输出', () => {
  const acc = fixture(); acc.consume(item('Reasoning', 1000, 11000));
  acc.consume(count(1000000, { usage: usage(1000), turn_token_usage: usage(1000000) }));
  assert.equal(acc.snapshot().currentTurn.generationSpeed.outputTokens, 1000);
  assert.equal(acc.snapshot().currentTurn.generationSpeed.value, 100);
});

test('从滞后的旧载体切换到现代载体时，不把累计跳变当作本轮输出', () => {
  const acc = createMetricsAccumulator({ threadId });
  acc.consume(event('token_count', { info: { total_token_usage: usage(10000), last_token_usage: usage(0) } }));
  acc.consume(event('task_started')); acc.consume(item('Reasoning', 1000, 11000));
  acc.consume(count(1000000, { usage: usage(1000), turn_token_usage: usage(1000) }));
  assert.equal(acc.snapshot().currentTurn.generationSpeed.outputTokens, 1000);
  assert.equal(acc.snapshot().currentTurn.generationSpeed.value, 100);
});

test('有完整模型计时的完成记录，不依赖整轮耗时来确认结束', () => {
  const acc = fixture(); acc.consume(item('Reasoning', 1000, 11000)); acc.consume(count(1000));
  const measured = acc.snapshot();
  let now = 1000;
  const model = createRuntimeModel({ now: () => now }); model.setIdentity(identity);
  model.consume({ type: 'mcp-notification', hostId: 'local', method: 'turn/started', params: { threadId, turn: { id: 'a' } } });
  now = 12000;
  model.consume({ type: 'mcp-notification', hostId: 'local', method: 'thread/tokenUsage/updated', params: { threadId, turnId: 'a', tokenUsage: { total: { inputTokens: 100, outputTokens: 1000 }, last: { inputTokens: 100, outputTokens: 1000 } } } });
  model.setLogSnapshot(identity, { ...measured, currentTurn: null, lastTurn: { ...measured.currentTurn, status: 'completed', coverage: 'observed-responses-only', completedAtMs: null, durationMs: null }, updatedAt: new Date(13000).toISOString() });
  assert.equal(model.snapshot().currentTurn, null);
  assert.equal(model.snapshot().speed.value, 100);
  assert.equal(model.snapshot().speed.status, 'completed');
});
