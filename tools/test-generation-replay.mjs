import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SessionIndex } from '../src/session-index.mjs';
import { createMetricsAccumulator } from '../src/metrics.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const status = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'CodexTokenStatusbar', 'native-experiment', 'status.json'), 'utf8').replace(/^\uFEFF/, ''));
const identities = status.pages.map(page => page.identity).filter(item => item?.status === 'resolved' && item.hostId === 'local');
assert.equal(identities.length, 1, '需要一个已确认的本机对话。');
const identity = identities[0], index = new SessionIndex(path.join(os.homedir(), '.codex'));
const synthetic = '11111111-2222-3333-4444-555555555555';
const turns = new Map(), responses = new Map();
const alias = (map, value, prefix) => { if (typeof value !== 'string') return undefined; if (!map.has(value)) map.set(value, prefix + (map.size + 1)); return map.get(value); };
const fields = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
const usage = value => value && Object.fromEntries(fields.filter(key => key in value).map(key => [key, value[key]]));
let selected;
try {
  assert.ok(index.read(identity), '本机索引、路径和会话元数据必须匹配。');
  const filename = [...index.readers.keys()][0], fd = fs.openSync(filename, 'r');
  let bytes;
  try {
    const size = fs.fstatSync(fd).size, start = Math.max(0, size - 64 * 1024 * 1024);
    const buffer = Buffer.alloc(size - start); fs.readSync(fd, buffer, 0, buffer.length, start);
    bytes = start > 0 ? buffer.subarray(buffer.indexOf(10) + 1) : buffer;
  } finally { fs.closeSync(fd); }
  const records = [];
  // 只保留计数、项目类型和计时；替换身份，不复制正文、提示或工具参数。
  for (const line of bytes.toString('utf8').split('\n')) {
    let record; try { record = JSON.parse(line); } catch { continue; }
    const p = record.payload ?? {}, event = record.type === 'event_msg' ? p.type : null;
    if (p.thread_id && p.thread_id !== identity.threadId) continue;
    const base = { type: record.type, timestamp: record.timestamp };
    if (record.type === 'token_usage_record') records.push({ ...base, payload: {
      turn_id: alias(turns, p.turn_id, 't'), response_id: alias(responses, p.response_id, 'r'),
      usage: usage(p.usage), thread_token_usage: usage(p.thread_token_usage), turn_token_usage: usage(p.turn_token_usage),
    } });
    else if (['task_started', 'task_complete', 'turn_aborted', 'item_completed', 'token_count'].includes(event)) records.push({ ...base, payload: {
      type: event, turn_id: alias(turns, p.turn_id ?? p.root_turn_id, 't'),
      ...Object.fromEntries(['started_at', 'completed_at', 'duration_ms', 'time_to_first_token_ms', 'started_at_ms', 'completed_at_ms'].filter(key => key in p).map(key => [key, p[key]])),
      ...(event === 'item_completed' ? { item: { type: p.item?.type } } : {}),
      ...(event === 'token_count' ? { info: { total_token_usage: usage(p.info?.total_token_usage), last_token_usage: usage(p.info?.last_token_usage) } } : {}),
    } });
  }
  const starts = records.flatMap((record, i) => record.payload?.type === 'task_started' ? [i] : []);
  assert.ok(starts.length, '读取范围内缺少轮次开始记录。');
  const first = starts.slice(-4)[0];
  const preceding = records.slice(0, first);
  const baseline = preceding.findLast(record => record.type === 'token_usage_record' && Number.isSafeInteger(record.payload.thread_token_usage?.output_tokens))
    ?? preceding.findLast(record => Number.isSafeInteger(record.payload?.info?.total_token_usage?.output_tokens));
  selected = [{ type: 'session_meta', payload: { id: synthetic } }, ...(baseline ? [baseline] : []), ...records.slice(first)];
} finally { index.close(); }

const accumulator = createMetricsAccumulator({ threadId: synthetic }), cases = [], consumed = [];
for (const record of selected) {
  accumulator.consume(record); consumed.push(record);
  if (['task_complete', 'turn_aborted'].includes(record.payload?.type)) cases.push({ kind: 'metrics', options: { threadId: synthetic }, records: [...consumed], expected: accumulator.snapshot() });
}
cases.push({ kind: 'metrics', options: { threadId: synthetic }, records: consumed, expected: accumulator.snapshot() });
const build = path.join(root, '.desktop-build'); fs.mkdirSync(build, { recursive: true });
const input = path.join(build, 'generation-replay-cases.json'), output = path.join(build, 'generation-replay-actual.json');
fs.writeFileSync(input, JSON.stringify(cases));
execFileSync(path.join(build, 'Backend.Tests.exe'), [input, output, path.join(root, 'src', 'api-prices.json')], { stdio: 'inherit' });
const actual = JSON.parse(fs.readFileSync(output, 'utf8'));
for (let i = 0; i < cases.length; i++) assert.deepStrictEqual(actual[i], cases[i].expected);
const measured = actual.map(snapshot => snapshot.currentTurn?.generationSpeed ?? snapshot.lastTurn?.generationSpeed).filter(Boolean);
assert.ok(measured.length, '真实记录没有产生有效生成速度。');
const report = { passed: cases.length, sanitizedRecords: consumed.length,
  measured: measured.map(value => ({ tps: +value.value.toFixed(2), modelMs: value.durationMs, outputTokens: value.outputTokens, samples: value.sampleCount })),
  scope: '本机已确认对话的脱敏计数与计时回放；不注入、不发请求、不复制正文' };
fs.writeFileSync(path.join(root, 'reports', 'generation-live-replay.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
