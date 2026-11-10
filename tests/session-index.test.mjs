import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SessionIndex } from '../src/session-index.mjs';

const ID = '01a1ba45-994e-75f3-ac70-6be9853c67b9';
const OTHER = '01a1ba45-994e-75f3-ac70-6be9853c67b8';
const identity = { status: 'resolved', hostId: 'local', threadId: ID };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cts-index-'));
  const sessions = path.join(root, 'sessions'); fs.mkdirSync(sessions);
  const db = new DatabaseSync(path.join(root, 'state_5.sqlite'));
  db.exec('CREATE TABLE threads(id TEXT PRIMARY KEY, rollout_path TEXT)');
  const file = path.join(sessions, 'rollout.jsonl');
  const writeLog = id => fs.writeFileSync(file,
    JSON.stringify({ type: 'session_meta', payload: { id } }) + '\n' +
    JSON.stringify({ type: 'token_usage_record', payload: { thread_id: id, thread_token_usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, total_tokens: 110 } } }) + '\n');
  writeLog(ID);
  db.prepare('INSERT INTO threads VALUES(?,?)').run(ID, file); db.close();
  const index = new SessionIndex(root);
  // 只清理由本测试新建的临时目录。
  t.after(() => { index.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, file, index, writeLog };
}
test('只读索引按核心 ID 查找日志，远程主机不会读取本机同名线程', t => {
  const f = fixture(t);
  assert.equal(f.index.read(identity).total.total_tokens, 110);
  assert.equal(f.index.read({ ...identity, hostId: 'remote' }), null);
  assert.equal(f.index.read({ ...identity, status: 'alias-unresolved' }), null);
});
test('数据库路径与日志元数据不一致时拒绝归属，包含缓存后的替换', t => {
  const f = fixture(t);
  f.index.read(identity);
  f.writeLog(OTHER);
  assert.equal(f.index.read(identity), null);
});
test('索引指向 sessions 目录之外时不读取该文件', t => {
  const f = fixture(t);
  const outside = path.join(f.root, 'outside.jsonl'); fs.copyFileSync(f.file, outside);
  const db = new DatabaseSync(path.join(f.root, 'state_5.sqlite'));
  db.prepare('UPDATE threads SET rollout_path=? WHERE id=?').run(outside, ID); db.close();
  assert.equal(f.index.read(identity), null);
});

test('Windows 扩展路径前缀与普通路径使用同一归属边界', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const db = new DatabaseSync(path.join(f.root, 'state_5.sqlite'));
  db.prepare('UPDATE threads SET rollout_path=? WHERE id=?').run(path.toNamespacedPath(f.file), ID);
  assert.equal(f.index.read(identity).total.total_tokens, 110);
  const outside = path.join(f.root, 'outside.jsonl');
  fs.copyFileSync(f.file, outside);
  db.prepare('UPDATE threads SET rollout_path=? WHERE id=?').run(path.toNamespacedPath(outside), ID);
  db.close();
  assert.equal(f.index.read(identity), null);
});
