import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RolloutReader } from '../src/rollout-reader.mjs';

const usage = total => ({ timestamp: '2026-11-08T00:00:00Z', type: 'token_usage_record', payload: {
  thread_id: 'thread-a', turn_id: 'turn-a', response_id: `response-${total}`,
  thread_token_usage: { input_tokens: total - 10, cached_input_tokens: 20, output_tokens: 10, total_tokens: total },
  turn_token_usage: { input_tokens: total - 10, cached_input_tokens: 20, output_tokens: 10, total_tokens: total },
} });
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cts-reader-'));
  const file = path.join(directory, 'rollout.jsonl');
  // 只删除本测试创建的随机临时目录。
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return file;
}
test('写入半条记录时保留旧值，换行后更新，避免误计坏数据', t => {
  const file = fixture(t);
  fs.writeFileSync(file, JSON.stringify(usage(100)) + '\n');
  const reader = new RolloutReader(file, { threadId: 'thread-a' });
  assert.equal(reader.read().total.total_tokens, 100);
  const next = JSON.stringify(usage(200));
  fs.appendFileSync(file, next.slice(0, 60));
  assert.equal(reader.read().total.total_tokens, 100);
  fs.appendFileSync(file, next.slice(60) + '\n');
  const result = reader.read();
  assert.equal(result.total.total_tokens, 200);
  assert.equal(result.diagnostics.malformedLines, 0);
});
test('尾部窗口不足时向前扩展并跳过开头半行', t => {
  const file = fixture(t);
  fs.writeFileSync(file, JSON.stringify(usage(300)) + '\n' + JSON.stringify({ type: 'ignored', text: '中文'.repeat(1000) }) + '\n');
  const reader = new RolloutReader(file, { threadId: 'thread-a', initialBytes: 100, maxInitialBytes: 20000 });
  assert.equal(reader.read().total.total_tokens, 300);
});
test('文件截断后重新建立累计状态', t => {
  const file = fixture(t);
  fs.writeFileSync(file, JSON.stringify(usage(99999)) + '\n' + ' '.repeat(500));
  const reader = new RolloutReader(file, { threadId: 'thread-a' });
  reader.read();
  fs.writeFileSync(file, JSON.stringify(usage(100)) + '\n');
  assert.equal(reader.read().total.total_tokens, 100);
});
test('即使尾部已有累计值也回读定价上下文，避免费用只覆盖最后一段', t => {
  const file = fixture(t);
  const value = { input_tokens: 100000, cached_input_tokens: 80000, cache_write_input_tokens: 0, output_tokens: 2000, total_tokens: 102000 };
  fs.writeFileSync(file, [
    { type: 'session_meta', payload: { id: 'thread-a', model_provider: 'openai' } },
    { type: 'turn_context', payload: { turn_id: 'turn-a', model: 'gpt-6.1-sol' } },
    { type: 'ignored', text: '填充'.repeat(5000) },
    { type: 'token_usage_record', payload: { thread_id: 'thread-a', turn_id: 'turn-a', response_id: 'r1', usage: value, thread_token_usage: value, turn_token_usage: value } },
  ].map(JSON.stringify).join('\n') + '\n');
  const reader = new RolloutReader(file, { threadId: 'thread-a', initialBytes: 1024, maxInitialBytes: 50000 });
  const state = reader.read();
  assert.equal(state.reader.startedFromTail, false);
  assert.equal(state.cost.total.complete, true);
  assert.equal(state.cost.total.amount.minPicoUsd, '68000000000');
});
