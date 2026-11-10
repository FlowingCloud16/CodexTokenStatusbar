import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageDecoder } from '../src/message-decoder.mjs';

const packet = (sequence, kind, tokens, transferId = 'transfer-a') => ({ marker: 'codex-host-chunked-message-v1', transferId, sequence, kind, ...(tokens ? { tokens } : {}) });
test('完整消息直接传递，分片按序恢复业务对象且不产生 ACK', () => {
  const decoder = createMessageDecoder();
  const plain = { type: 'mcp-notification' };
  assert.equal(decoder.receive(plain), plain);
  decoder.receive(packet(0, 'start'));
  decoder.receive(packet(1, 'chunk', [
    { type: 'object-start' }, { type: 'key', value: 'type' }, { type: 'value', value: 'mcp-notification' },
    { type: 'key', value: 'params' }, { type: 'object-start' }, { type: 'key', value: 'delta' },
    { type: 'string-start', target: 'value' }, { type: 'string-chunk', value: '中文' },
  ]));
  decoder.receive(packet(2, 'chunk', [{ type: 'string-chunk', value: '🔐' }, { type: 'string-end' }, { type: 'container-end' }, { type: 'container-end' }]));
  assert.deepEqual(decoder.receive(packet(3, 'end')), { type: 'mcp-notification', params: { delta: '中文🔐' } });
  assert.equal(decoder.inspect().completed, 1);
});
test('丢包和超时使传输失效，不恢复残缺统计', () => {
  let time = 0;
  const decoder = createMessageDecoder({ now: () => time, timeoutMs: 100 });
  decoder.receive(packet(0, 'start'));
  assert.equal(decoder.receive(packet(2, 'chunk', [{ type: 'value', value: 123 }])), null);
  assert.equal(decoder.receive(packet(3, 'end')), null);
  decoder.receive(packet(0, 'start'));
  time = 101;
  assert.equal(decoder.receive(packet(1, 'end')), null);
  assert.equal(decoder.inspect().pending, 0);
});
test('超预算或未闭合对象不能传给指标层', () => {
  const decoder = createMessageDecoder({ maxCharacters: 3 });
  decoder.receive(packet(0, 'start'));
  decoder.receive(packet(1, 'chunk', [{ type: 'value', value: '1234' }]));
  assert.equal(decoder.receive(packet(2, 'end')), null);
  decoder.receive(packet(0, 'start'));
  decoder.receive(packet(1, 'chunk', [{ type: 'object-start' }, { type: 'key', value: 'a' }]));
  assert.equal(decoder.receive(packet(2, 'end')), null);
});
test('特殊对象键按数据处理，不能改变对象原型', () => {
  const decoder = createMessageDecoder();
  decoder.receive(packet(0, 'start'));
  decoder.receive(packet(1, 'chunk', [{ type: 'object-start' }, { type: 'key', value: '__proto__' }, { type: 'value', value: 'literal' }, { type: 'container-end' }]));
  const result = decoder.receive(packet(2, 'end'));
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.hasOwn(result, '__proto__'), true);
  assert.equal(result.__proto__, 'literal');
});
