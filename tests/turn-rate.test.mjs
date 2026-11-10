import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTurnRate } from '../src/turn-rate.mjs';
import { createRuntimeModel } from '../src/runtime-model.mjs';

const turn = { id: 'turn', coverage: 'complete', usage: { output_tokens: 200 }, startedAtMs: 1000, usageUpdatedAtMs: 11000 };
test('采样平均值在等待或工具执行期间保持，分母与用量时间对齐', () => {
  const snapshot = { currentTurn: turn };
  assert.equal(estimateTurnRate(snapshot, 11000).value, 20);
  const later = estimateTurnRate(snapshot, 21000);
  assert.equal(later.value, 20);
  assert.equal(later.estimated, true);
  assert.equal(later.live, false);
  assert.equal(later.status, 'sampled');
  assert.equal(later.sampleAgeMs, 10000);
  assert.equal(later.elapsedMs, 20000);
  assert.equal(later.durationMs, 10000);
  assert.match(later.basis, /waiting-and-tools/);
  const next = estimateTurnRate({ currentTurn: { ...turn, usage: { output_tokens: 600 }, usageUpdatedAtMs: 21000 } }, 31000);
  assert.equal(next.value, 30);
  assert.equal(next.sampleAgeMs, 10000);
});
test('已完成轮次采用正式耗时，结果不会随当前时间下降', () => {
  const snapshot = { lastTurn: { ...turn, durationMs: 5000, completedAtMs: 9000 } };
  assert.equal(estimateTurnRate(snapshot, 100000).value, 40);
  assert.equal(estimateTurnRate(snapshot, 200000).value, 40);
  assert.equal(estimateTurnRate(snapshot).live, false);
  assert.equal(estimateTurnRate({ lastTurn: { ...turn, completedAtMs: 11000 } }).value, 20);
});
test('缺少完整轮次统计或有效计时时不显示速率，真实零输出可显示零', () => {
  assert.equal(estimateTurnRate({ currentTurn: { ...turn, coverage: 'observed-responses-only' } }, 11000), null);
  assert.equal(estimateTurnRate({ currentTurn: { ...turn, startedAtMs: null } }, 11000), null);
  assert.equal(estimateTurnRate({ currentTurn: { ...turn, usageUpdatedAtMs: null } }, 11000), null);
  assert.equal(estimateTurnRate({ currentTurn: { ...turn, usageUpdatedAtMs: 1000 } }, 11000), null);
  assert.equal(estimateTurnRate({ currentTurn: turn }, 1000), null);
  assert.equal(estimateTurnRate({ currentTurn: turn }, 500), null);
  assert.equal(estimateTurnRate({ currentTurn: { ...turn, usage: { output_tokens: null } } }, 11000), null);
  assert.equal(estimateTurnRate({ currentTurn: { ...turn, usage: { output_tokens: 0 } } }, 11000).value, 0);
});
test('整轮吞吐可作诊断，缺少模型窗口时主速度等待采样', () => {
  const id = '01a1ba45-994e-75f3-ac70-6be9853c67b9';
  const identity = { status: 'resolved', threadId: id, hostId: 'local' };
  let now = 11000;
  const model = createRuntimeModel({ now: () => now });
  model.setIdentity(identity);
  model.setLogSnapshot(identity, { threadId: id, total: { total_tokens: 300 }, currentTurn: turn });
  assert.equal(model.snapshot().turnRate.value, 20);
  assert.equal(model.snapshot().speed, null);
  assert.match(model.snapshot().scopeNote, /complete model-output timing/);
  assert.equal(model.snapshot().ratePending, true);
  now = 71000;
  assert.equal(model.snapshot().turnRate.value, 20);
  assert.equal(model.snapshot().turnRate.sampleAgeMs, 60000);
  model.setLogSnapshot(identity, { threadId: id, total: { total_tokens: 700 }, currentTurn: { ...turn, usage: { output_tokens: 600 }, usageUpdatedAtMs: 21000 } });
  assert.equal(model.snapshot().turnRate.value, 30);
  model.setIdentity({ status: 'identity-unresolved' });
  assert.equal(model.snapshot().turnRate ?? null, null);
});
