import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeModel } from '../src/runtime-model.mjs';

const A = '01a1ba45-994e-75f3-ac70-6be9853c67b9';
const B = '01a1ba45-994e-75f3-ac70-6be9853c67b8';
const identity = (threadId = A, hostId = 'local') => ({ status: 'resolved', threadId, hostId, source: 'test-scope' });
const update = (threadId = A, hostId = 'local', total = 110) => ({ type: 'mcp-notification', hostId, method: 'thread/tokenUsage/updated', params: {
  threadId, turnId: B, tokenUsage: { total: { inputTokens: total - 10, cachedInputTokens: 80, outputTokens: 10, reasoningOutputTokens: 4, totalTokens: total }, last: { inputTokens: 100, cachedInputTokens: 80, outputTokens: 10, reasoningOutputTokens: 4, totalTokens: 110 } },
} });
test('当前对话按 host 与核心 ID 隔离，切换后不显示前一对话数值', () => {
  const model = createRuntimeModel();
  model.setIdentity(identity()); model.consume(update());
  assert.equal(model.snapshot().total.total_tokens, 110);
  model.setIdentity(identity(B));
  assert.equal(model.snapshot().total, null);
  model.setIdentity(identity(A, 'remote'));
  assert.equal(model.snapshot().total, null);
  model.consume(update(A, 'remote', 210));
  assert.equal(model.snapshot().total.total_tokens, 210);
  model.setIdentity(identity());
  assert.equal(model.snapshot().total.total_tokens, 110);
  model.setIdentity({ status: 'alias-unresolved' });
  assert.equal(model.snapshot().total, null);
});
test('运行时累计快照替换、重复通知去重、流式文本只做诊断', () => {
  const model = createRuntimeModel(); model.setIdentity(identity());
  model.consume(update()); model.consume(update());
  model.consume({ type: 'mcp-notification', hostId: 'local', method: 'item/agentMessage/delta', params: { threadId: A, delta: '私密🔐' } });
  const result = model.snapshot();
  assert.equal(result.total.total_tokens, 110);
  assert.equal(result.cacheHitRate, 80);
  assert.equal(result.speed, null);
  assert.equal(result.currentTurn.responseCount, 1);
  assert.equal(result.runtimeDiagnostics.visibleDeltaEvents, 1);
  assert.equal(result.runtimeDiagnostics.visibleCharacters, 4);
  assert.ok(!JSON.stringify(result).includes('私密'));
});
test('日志快照必须属于指定核心线程，后台更新不改变当前绑定', () => {
  const model = createRuntimeModel(); model.setIdentity(identity());
  assert.equal(model.setLogSnapshot(identity(), { threadId: B, total: { total_tokens: 999 } }), false);
  model.consume(update(B));
  assert.equal(model.snapshot().total, null);
  model.setLogSnapshot(identity(), { threadId: A, total: { total_tokens: 500 }, updatedAt: new Date().toISOString() });
  assert.equal(model.snapshot().total.total_tokens, 500);
});
