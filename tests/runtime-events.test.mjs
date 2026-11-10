import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePageMessage } from '../src/runtime-events.mjs';

test('流式文本仅保留长度，不泄漏正文，不把片段数当作 token', () => {
  const message = { type: 'mcp-notification', method: 'item/agentMessage/delta', params: {
    threadId: '01a1ba45-994e-75f3-ac70-6be9853c67b9', turnId: '01a1ba45-994e-75f3-ac70-6be9853c67b8', delta: '私密正文🔐',
  } };
  const result = summarizePageMessage(message);
  assert.equal(result.deltaCharacters, 6);
  assert.equal(result.threadId, message.params.threadId);
  assert.equal(result.tokenCount, undefined);
  assert.ok(!JSON.stringify(result).includes('私密正文'));
});
test('只复制已验证的用量字段，缺失值保持未知', () => {
  const result = summarizePageMessage({ type: 'mcp-notification', method: 'thread/tokenUsage/updated', params: {
    tokenUsage: { total: { inputTokens: 100, cachedInputTokens: 80, outputTokens: 10, totalTokens: 110, secret: '不应复制' } },
  } });
  assert.equal(result.tokenUsage.total.cachedInputTokens, 80);
  assert.equal(result.tokenUsage.total.reasoningOutputTokens, null);
  assert.equal(result.tokenUsage.total.secret, undefined);
});
test('传输序列化单元明确与模型 token 区分，且不复制内容', () => {
  const result = summarizePageMessage({ marker: 'codex-host-chunked-message-v1', kind: 'chunk', tokens: [{ value: '私密数据' }] });
  assert.deepEqual(result, { type: 'serialized-message-chunk', kind: 'chunk', transportUnitCount: 1 });
});
