import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeModel } from '../src/runtime-model.mjs';

const A = '01a1ba45-994e-75f3-ac70-6be9853c67b9';
const B = '01a1ba45-994e-75f3-ac70-6be9853c67b8';
const identity = { status: 'resolved', hostId: 'local', threadId: A };
const u = (input = 1000, output = 200) => ({ input_tokens: input, cached_input_tokens: input * .8, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: output / 4, total_tokens: input + output });
const wire = usage => ({ inputTokens: usage.input_tokens, cachedInputTokens: usage.cached_input_tokens, cacheWriteInputTokens: usage.cache_write_input_tokens, outputTokens: usage.output_tokens, reasoningOutputTokens: usage.reasoning_output_tokens, totalTokens: usage.total_tokens });
const turn = (extra = {}) => ({ id: 'turn-a', status: 'running', coverage: 'complete', usage: u(), startedAtMs: 1000, usageUpdatedAtMs: 11000, ...extra });
const log = (extra = {}) => ({ threadId: A, total: u(), currentTurn: turn(), lastTurn: null, updatedAt: new Date(11000).toISOString(), ...extra });
function fixture() {
  let now = 11005;
  const model = createRuntimeModel({ now: () => now });
  model.setIdentity(identity);
  return {
    model, time: value => { now = value; },
    offline: value => model.setLogSnapshot(identity, value),
    update: (total = u(), id = 'turn-a', last = total) => model.consume({ type: 'mcp-notification', hostId: 'local', method: 'thread/tokenUsage/updated', params: { threadId: A, turnId: id, tokenUsage: { total: wire(total), last: wire(last) } } }),
    event: (method, id = 'turn-a') => model.consume({ type: 'mcp-notification', hostId: 'local', method, params: { threadId: A, turn: { id } } }),
    read: () => model.snapshot(),
  };
}

test('中途接入的实时通知晚 5ms 也不能清空完整日志的速度与计时', () => {
  const f = fixture(); f.offline(log());
  assert.equal(f.read().turnRate.value, 20);
  f.update();
  const result = f.read();
  assert.equal(result.turnRate.value, 20);
  assert.equal(result.currentTurn.startedAtMs, 1000);
  assert.equal(result.currentTurn.coverage, 'complete');
  assert.equal(result.ratePending, true);
  assert.equal(result.speed, null);
});

test('实时累计领先时保持同一轮完整采样，日志追上后成套更新输出与采样时间', () => {
  const f = fixture(); f.offline(log());
  f.time(21005); f.update(u(2000, 600));
  let result = f.read();
  assert.equal(result.total.output_tokens, 600);
  assert.equal(result.currentTurn.usage.output_tokens, 200);
  assert.equal(result.turnRate.value, 20);
  assert.equal(result.turnRate.sampleAgeMs, 10005);
  assert.equal(result.turnRate.durationMs, 10000);
  f.offline(log({ total: u(2000, 600), currentTurn: turn({ usage: u(2000, 600), usageUpdatedAtMs: 21000 }), updatedAt: new Date(21000).toISOString() }));
  result = f.read();
  assert.equal(result.turnRate.value, 30);
  assert.equal(result.turnRate.outputTokens, 600);
  assert.equal(result.turnRate.durationMs, 20000);
});

test('本机实时证据完整时可采用新采样，相同计数重复通知保留正式日志时间', () => {
  const f = fixture();
  f.time(500); f.update(u(), 'previous');
  f.time(1000); f.event('turn/started');
  f.time(11005); f.update(u(2000, 400), 'turn-a', u());
  f.offline(log({ total: u(2000, 400) }));
  assert.equal(f.read().turnRate.sampledAtMs, 11000);
  f.time(16000); f.update(u(2000, 400), 'turn-a', u());
  assert.equal(f.read().turnRate.sampledAtMs, 11000);
  assert.equal(f.read().turnRate.value, 20);
  f.time(21000); f.update(u(3000, 800), 'turn-a', u(1000, 400));
  assert.equal(f.read().turnRate.value, 30);
  assert.equal(f.read().turnRate.outputTokens, 600);
  assert.equal(f.read().turnRate.sampledAtMs, 21000);
});

test('实时来源尚无累计时的新轮次开始仍应进入等待采样，不显示上一轮速度', () => {
  const f = fixture();
  f.offline(log({ currentTurn: null, lastTurn: turn({ status: 'completed', completedAtMs: 11000, durationMs: 10000 }) }));
  assert.equal(f.read().turnRate.value, 20);
  f.time(12000); f.event('turn/started', 'turn-b');
  const result = f.read();
  assert.equal(result.currentTurn.id, 'turn-b');
  assert.equal(result.total.total_tokens, 1200);
  assert.equal(result.turnRate, null);
  assert.equal(result.ratePending, true);
  assert.equal(result.noteKey, 'note.waitingSample');
});

test('迟到的旧轮次用量与完成通知不会覆盖新轮次的有效速度', () => {
  const f = fixture();
  f.time(31000);
  f.offline(log({ currentTurn: turn({ id: 'turn-b', startedAtMs: 20000, usageUpdatedAtMs: 30000 }), lastTurn: turn({ status: 'completed', completedAtMs: 15000, durationMs: 14000 }), updatedAt: new Date(30000).toISOString() }));
  f.update();
  assert.equal(f.read().currentTurn.id, 'turn-b');
  assert.equal(f.read().turnRate.value, 20);
  f.time(31005); f.event('turn/completed');
  assert.equal(f.read().currentTurn.id, 'turn-b');
  assert.equal(f.read().turnRate.value, 20);
});

test('迟到的旧轮次日志不能取消实时来源已经确认的新轮次开始', () => {
  const f = fixture();
  f.time(12000); f.event('turn/started', 'turn-b');
  f.offline(log({ currentTurn: null, lastTurn: turn({ status: 'completed', completedAtMs: 11000, durationMs: 10000 }), updatedAt: new Date(12005).toISOString() }));
  assert.equal(f.read().currentTurn.id, 'turn-b');
  assert.equal(f.read().turnRate, null);
  assert.equal(f.read().ratePending, true);
});

test('同一轮已有正式完成记录时，较晚的实时运行或空计时完成通知不使其复活', () => {
  const f = fixture();
  f.offline(log({ currentTurn: null, lastTurn: turn({ status: 'completed', completedAtMs: 11000, durationMs: 10000 }) }));
  f.update();
  assert.equal(f.read().currentTurn, null);
  assert.equal(f.read().turnRate.status, 'completed');
  assert.equal(f.read().turnRate.value, 20);
  f.time(12000); f.event('turn/completed');
  assert.equal(f.read().lastTurn.durationMs, 10000);
  assert.equal(f.read().turnRate.value, 20);
  f.time(50000);
  assert.equal(f.read().turnRate.value, 20);
});

test('完成通知先到但最终日志未到时保持完整采样，不用旧输出除以新完成时间', () => {
  const f = fixture(); f.offline(log()); f.update();
  f.time(21000); f.event('turn/completed');
  assert.equal(f.read().turnRate.value, 20);
  assert.equal(f.read().turnRate.status, 'sampled');
  f.offline(log({ currentTurn: null, lastTurn: turn({ status: 'completed', usage: u(2000, 600), usageUpdatedAtMs: 20000, completedAtMs: 21000, durationMs: 20000 }), total: u(2000, 600), updatedAt: new Date(21005).toISOString() }));
  assert.equal(f.read().turnRate.value, 30);
  assert.equal(f.read().turnRate.status, 'completed');
});

test('累计重置后不沿用旧速度，对话与主机切换不泄漏完整采样', () => {
  const f = fixture(); f.offline(log());
  f.update(u(100, 20));
  assert.equal(f.read().total.total_tokens, 120);
  assert.equal(f.read().turnRate, null);
  assert.equal(f.read().ratePending, true);
  f.model.setIdentity({ ...identity, threadId: B });
  assert.equal(f.read().turnRate, null);
  assert.equal(f.read().ratePending, false);
  f.model.setIdentity({ ...identity, hostId: 'remote' });
  assert.equal(f.read().turnRate, null);
  assert.equal(f.read().total, null);
});

test('首次加载即使缺少开始时间也等待有效证据，不把推测时间变成速度', () => {
  const f = fixture(); f.update();
  assert.equal(f.read().turnRate, null);
  assert.equal(f.read().ratePending, true);
  assert.equal(f.read().currentTurn.startedAtMs, null);
  f.offline(log());
  assert.equal(f.read().turnRate.value, 20);
});

test('开始和结束通知不会让旧实时累计盖过日志中的较新计数', () => {
  const f = fixture();
  f.update();
  f.offline(log({ total: u(2000, 600), currentTurn: null, lastTurn: turn({ usage: u(2000, 600), status: 'completed', durationMs: 20000, completedAtMs: 21000 }), updatedAt: new Date(21000).toISOString(), totalUpdatedAt: new Date(20000).toISOString() }));
  assert.equal(f.read().total.output_tokens, 600);
  f.time(22000); f.event('turn/completed');
  assert.equal(f.read().total.output_tokens, 600);
  f.time(23000); f.event('turn/started', 'turn-b');
  assert.equal(f.read().total.output_tokens, 600);
  assert.equal(f.read().currentTurn.id, 'turn-b');
  assert.equal(f.read().ratePending, true);
  assert.equal(f.read().totalUpdatedAt, new Date(20000).toISOString());
});
