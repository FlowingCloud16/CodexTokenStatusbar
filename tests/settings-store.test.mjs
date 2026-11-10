import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSettingsStore, LAYOUTS } from '../tools/settings-store.mjs';

function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-statusbar-settings-'));
  try { run(path.join(directory, 'settings.json'), directory); }
  finally {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('codex-statusbar-settings-')) throw new Error('测试清理边界不符。');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

test('布局设置跨存储实例持久化，并兼容加载器的 JSON 字段顺序和 BOM', () => fixture(filename => {
  const store = createSettingsStore(filename);
  assert.equal(store.read().layout, 'adaptive');
  for (const layout of LAYOUTS) {
    store.save(layout);
    assert.equal(createSettingsStore(filename).read().layout, layout);
  }
  fs.writeFileSync(filename, '\uFEFF{"layout":"separate","schemaVersion":1}');
  assert.equal(store.read().layout, 'separate');
}));

test('未知布局、损坏文件及超大文件不会覆盖已确认的有效设置', () => fixture(filename => {
  const store = createSettingsStore(filename);
  store.save('icon');
  assert.throws(() => store.save('../../invalid'));
  assert.equal(JSON.parse(fs.readFileSync(filename)).layout, 'icon');
  for (const value of ['{', '{"layout":"invalid"}', 'x'.repeat(4097)]) {
    fs.writeFileSync(filename, value);
    assert.equal(store.read().layout, 'icon');
  }
  assert.equal(createSettingsStore(filename).read().layout, 'adaptive');
}));

test('设置写入失败可重试，临时文件不会累积', () => fixture((filename, directory) => {
  fs.mkdirSync(filename);
  const store = createSettingsStore(filename);
  assert.throws(() => store.save('separate'));
  assert.deepEqual(fs.readdirSync(directory), ['settings.json']);
  fs.rmdirSync(filename);
  store.save('separate');
  assert.equal(store.read().layout, 'separate');
  assert.deepEqual(fs.readdirSync(directory), ['settings.json']);
}));
