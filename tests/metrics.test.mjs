import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetricsAccumulator, parseRollout, normalizeUsage, cacheHitRate } from '../src/metrics.mjs';

const usage = (input, cached, output, reasoning = 0) => ({
  input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0,
  output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output,
});
const event = (type, rest = {}) => ({ type: 'event_msg', payload: { type, ...rest } });
const modern = (id, response, total, turn = response, turnId = 't1') => ({
  type: 'token_usage_record', payload: {
    thread_id: 'thread', turn_id: turnId, response_id: id,
    usage: response, thread_token_usage: total, turn_token_usage: turn,
  },
});
const legacy = (last, total) => event('token_count', { info: { last_token_usage: last, total_token_usage: total } });

test('累计快照采用替换，缓存输入和推理输出不重复加总', () => {
  const acc = createMetricsAccumulator();
  acc.consume(modern('r1', usage(100, 80, 20, 5), usage(100, 80, 20, 5)));
  acc.consume(modern('r2', usage(100, 80, 20, 5), usage(200, 160, 40, 10), usage(200, 160, 40, 10)));
  const state = acc.snapshot();
  assert.equal(state.total.total_tokens, 240);
  assert.equal(state.cacheHitRate, 80);
  assert.equal(state.latestResponse.usage.output_tokens, 20);
});

test('现代载体及旧载体顺序互换仍只统计一次响应', () => {
  for (const reversed of [false, true]) {
    const acc = createMetricsAccumulator();
    acc.consume(event('task_started', { turn_id: 't1' }));
    const response = usage(100, 80, 20);
    const pair = [modern('r1', response, response), legacy(response, response)];
    for (const record of reversed ? pair.reverse() : pair) acc.consume(record);
    const state = acc.snapshot();
    assert.equal(state.currentTurn.responseCount, 1);
    assert.equal(state.currentTurn.usage.total_tokens, 120);
    assert.equal(state.latestResponse.id, 'r1');
    assert.equal(state.diagnostics.duplicateUsageEvents, 1);
  }
});

test('同样的响应 token 数在不同累计快照下算作不同响应', () => {
  const acc = createMetricsAccumulator();
  const response = usage(100, 50, 10);
  acc.consume(event('task_started', { turn_id: 't1' }));
  acc.consume(legacy(response, response));
  acc.consume(legacy(response, usage(200, 100, 20)));
  assert.equal(acc.snapshot().currentTurn.responseCount, 2);
  assert.equal(acc.snapshot().currentTurn.usage.total_tokens, 220);
});

test('最近一轮汇总多个模型响应，并在下一轮开始后保留', () => {
  const acc = createMetricsAccumulator();
  acc.consume({ type: 'session_meta', payload: { id: 'thread' } });
  acc.consume(event('task_started', { turn_id: 't1', started_at: '2026-11-08T00:00:00Z' }));
  acc.consume(modern('r1', usage(100, 80, 20), usage(100, 80, 20)));
  acc.consume(modern('r2', usage(200, 100, 30), usage(300, 180, 50), usage(300, 180, 50)));
  acc.consume(event('task_complete', { turn_id: 't1', duration_ms: 5000 }));
  acc.consume(event('task_started', { turn_id: 't2' }));
  const state = acc.snapshot();
  assert.equal(state.lastTurn.usage.input_tokens, 300);
  assert.equal(state.lastTurn.usage.output_tokens, 50);
  assert.equal(state.lastTurn.responseCount, 2);
  assert.equal(state.currentTurn.id, 't2');
  assert.equal(state.endToEndSpeed.value, 10);
  assert.equal(state.endToEndSpeed.basis, 'whole-turn-including-waiting-and-tools');
});

test('零输入和缺失缓存字段不伪造百分比', () => {
  assert.equal(cacheHitRate(usage(0, 0, 20)), null);
  assert.equal(cacheHitRate(normalizeUsage({ input_tokens: 100, output_tokens: 10 })), null);
  assert.equal(cacheHitRate(usage(100, 0, 20)), 0);
});

test('项目时间无法归属到响应时不给虚假生成速度', () => {
  const acc = createMetricsAccumulator();
  acc.consume(event('item_completed', { turn_id: 't1', item: { type: 'Reasoning' }, started_at_ms: 1000, completed_at_ms: 1500 }));
  acc.consume(modern('r1', usage(100, 80, 20), usage(100, 80, 20)));
  assert.equal(acc.snapshot().speed, null);
  assert.equal(acc.snapshot().endToEndSpeed, null);
});

test('显式响应计时才可以计算生成平均速度', () => {
  const acc = createMetricsAccumulator();
  acc.consume(modern('r1', usage(100, 80, 20, 5), usage(100, 80, 20, 5)));
  acc.consume({ type: 'response_timing', payload: { response_id: 'r1', started_at_ms: 1000, completed_at_ms: 2000 } });
  assert.equal(acc.snapshot().speed.value, 20);
  assert.equal(acc.snapshot().speed.live, false);
});

test('旧版本错误 turn 快照通过任务开始基线排除', () => {
  const acc = createMetricsAccumulator();
  acc.consume(modern('old', usage(100, 50, 10), usage(100, 50, 10), usage(100, 50, 10), 'oldTurn'));
  acc.consume(event('task_started', { turn_id: 't1' }));
  acc.consume(modern('r1', usage(200, 100, 20), usage(300, 150, 30), usage(300, 150, 30)));
  assert.equal(acc.snapshot().currentTurn.usage.total_tokens, 220);
});

test('解析不完整尾行、限定线程，并保留未知状态', () => {
  const records = [
    { type: 'session_meta', payload: { id: 'thread' } },
    modern('r1', usage(100, 50, 10), usage(100, 50, 10)),
    { type: 'token_usage_record', payload: { thread_id: 'foreign', thread_token_usage: usage(999, 0, 99) } },
  ];
  const state = parseRollout(records.map(JSON.stringify).join('\n') + '\n{"type":', { threadId: 'thread' });
  assert.equal(state.total.total_tokens, 110);
  assert.equal(state.diagnostics.malformedLines, 1);
  assert.equal(state.diagnostics.ignoredForeignThreadEvents, 1);
  assert.equal(state.speed, null);
});

test('从日志尾部恢复时采用显式轮次快照，不捏造零基线', () => {
  const state = parseRollout(JSON.stringify(modern('r3', usage(100, 80, 20), usage(1000, 800, 200), usage(300, 240, 60))));
  assert.equal(state.currentTurn.usage.total_tokens, 360);
  assert.equal(state.currentTurn.coverage, 'complete');
  assert.equal(state.currentTurn.responseCount, 1);
});

test('任务 epoch 秒与响应显式毫秒按字段语义分别转换', () => {
  const acc = createMetricsAccumulator();
  acc.consume(event('task_started', { turn_id: 't1', started_at: 1794126486 }));
  assert.equal(acc.snapshot().currentTurn.startedAtMs, 1794126486000);
  acc.consume(modern('r1', usage(100, 80, 20), usage(100, 80, 20)));
  acc.consume({ type: 'response_timing', payload: { response_id: 'r1', started_at_ms: 1794126486500, completed_at_ms: 1794126487500 } });
  acc.consume(event('task_complete', {
    turn_id: 't1', started_at: 1794126486, completed_at: 1794126663, duration_ms: 176963,
  }));
  const state = acc.snapshot();
  assert.equal(state.lastTurn.startedAtMs, 1794126486000);
  assert.equal(state.lastTurn.completedAtMs, 1794126663000);
  assert.equal(state.lastTurn.durationMs, 176963);
  assert.equal(state.speed.durationMs, 1000);
  assert.equal(state.speed.value, 20);
});

test('计数采样时间只随新用量推进，重复通知及工具等待不会重置时间', () => {
  const acc = createMetricsAccumulator();
  acc.consume(event('task_started', { turn_id: 't1', started_at: '2026-11-08T00:00:00Z' }));
  const first = modern('r1', usage(100, 80, 20), usage(100, 80, 20));
  acc.consume({ ...first, timestamp: '2026-11-08T00:00:10Z' });
  const firstTime = Date.parse('2026-11-08T00:00:10Z');
  assert.equal(acc.snapshot().currentTurn.usageUpdatedAtMs, firstTime);
  acc.consume({ ...first, timestamp: '2026-11-08T00:00:15Z' });
  acc.consume({ ...legacy(usage(100, 80, 20), usage(100, 80, 20)), timestamp: '2026-11-08T00:00:16Z' });
  acc.consume({ ...event('item_completed', { turn_id: 't1', item: { type: 'Tool' } }), timestamp: '2026-11-08T00:00:20Z' });
  assert.equal(acc.snapshot().currentTurn.usageUpdatedAtMs, firstTime);
  acc.consume({ ...modern('r2', usage(100, 80, 40), usage(200, 160, 60), usage(200, 160, 60)), timestamp: '2026-11-08T00:00:30Z' });
  assert.equal(acc.snapshot().currentTurn.usageUpdatedAtMs, Date.parse('2026-11-08T00:00:30Z'));
  acc.consume(modern('r3', usage(100, 80, 20), usage(300, 240, 80), usage(300, 240, 80)));
  assert.equal(acc.snapshot().currentTurn.usageUpdatedAtMs, null);
});

test('现代与旧载体累计分歧时保留现代统计，完成轮次不会被冲成零或重复响应', () => {
  const acc = createMetricsAccumulator();
  acc.consume({ type: 'session_meta', payload: { id: 'thread' } });
  acc.consume(modern('old', usage(1000, 800, 200), usage(1000, 800, 200), usage(1000, 800, 200), 'old'));
  acc.consume(event('task_started', { turn_id: 't1', started_at: '2026-11-08T00:00:00Z' }));
  acc.consume({ ...modern('r1', usage(100, 80, 20), usage(1100, 880, 220)), timestamp: '2026-11-08T00:00:10Z' });
  acc.consume({ ...legacy(usage(100, 80, 20), usage(900, 780, 120)), timestamp: '2026-11-08T00:00:11Z' });
  assert.equal(acc.snapshot().total.total_tokens, 1320);
  assert.equal(acc.snapshot().currentTurn.usage.output_tokens, 20);
  assert.equal(acc.snapshot().currentTurn.responseCount, 1);
  assert.equal(acc.snapshot().currentTurn.usageUpdatedAtMs, Date.parse('2026-11-08T00:00:10Z'));
  acc.consume(event('task_complete', { turn_id: 't1', duration_ms: 12000 }));
  assert.equal(acc.snapshot().lastTurn.usage.output_tokens, 20);
  assert.equal(acc.snapshot().diagnostics.ignoredLegacyUsageEvents, 1);
  // 正式现代快照仍然采用替换，不能通过取最大值掩盖来源分歧。
  acc.consume(modern('r2', usage(50, 20, 10), usage(50, 20, 10), usage(50, 20, 10), 't2'));
  assert.equal(acc.snapshot().total.total_tokens, 60);
});
