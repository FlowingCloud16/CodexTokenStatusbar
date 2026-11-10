import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeLease } from '../src/bridge-lease.mjs';

test('独立临时组件无需桥接租约，常驻认领后拒绝其他写入者', () => {
  const lease = createBridgeLease({ now: () => 100 });
  assert.equal(lease.inspect().required, false);
  assert.equal(lease.accepts(undefined), true);
  assert.equal(lease.claim('manager-a'), true);
  assert.equal(lease.accepts('manager-a'), true);
  assert.equal(lease.accepts(undefined), false);
  assert.equal(lease.claim('manager-b'), false);
  assert.equal(lease.renew('manager-b'), false);
});
test('心跳超时后允许新实例接管，旧实例不能继续写入', () => {
  let time = 0;
  const lease = createBridgeLease({ now: () => time });
  lease.claim('manager-a', 10000);
  time = 10001;
  assert.equal(lease.inspect().connected, false);
  assert.equal(lease.claim('manager-b'), true);
  assert.equal(lease.accepts('manager-a'), false);
  assert.equal(lease.renew('manager-a'), false);
  assert.equal(lease.inspect().connected, true);
});
test('同一管理器恢复连接可续租，重复认领不产生额外所有者', () => {
  let time = 0;
  const lease = createBridgeLease({ now: () => time });
  lease.claim('manager-a'); time = 20000;
  assert.equal(lease.renew('manager-a'), true);
  assert.equal(lease.inspect().lastSeenAtMs, 20000);
  assert.equal(lease.claim('manager-a'), true);
  assert.equal(lease.inspect().ownerId, 'manager-a');
});
test('非法所有者和租期不能建立租约', () => {
  const lease = createBridgeLease();
  for (const candidate of ['', null, {}, 'x'.repeat(129)]) assert.equal(lease.claim(candidate), false);
  for (const duration of [NaN, Infinity, 0, 2999, 60001]) assert.equal(lease.claim('manager', duration), false);
  assert.equal(lease.inspect().required, false);
});
