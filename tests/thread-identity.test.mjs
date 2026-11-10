import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_THREAD_PREFIX, createThreadIdentityRegistry, parseLocalThreadRoute, resolveLocalThreadIdentity,
} from '../src/thread-identity.mjs';

const coreA = '01a1ba45-994e-75f3-ac70-6be9853c67b9';
const coreB = '01a1ba45-994e-75f3-ac70-6be9853c67b8';
const clientId = `${CLIENT_THREAD_PREFIX}33333333-3333-4333-8333-333333333333`;

test('已确认的核心线程路由与快捷窗口路由可解析，其他路径中的 UUID 不会命中', () => {
  for (const path of [`/local/${coreA}`, `/hotkey-window/thread/${coreA}`]) {
    const result = resolveLocalThreadIdentity(parseLocalThreadRoute({ pathname: path, search: '?hostId=local' }));
    assert.equal(result.status, 'resolved');
    assert.equal(result.threadId, coreA);
    assert.equal(result.hostId, 'local');
  }
  for (const pathname of [`/settings/${coreA}`, `/dots/thread/${coreA}`, `/local/${coreA}/other`, '/local/%2f']) {
    assert.equal(parseLocalThreadRoute({ pathname }), null);
  }
});

test('client-new-thread 别名必须显式映射，不能剥掉前缀当核心 UUID', () => {
  const registry = createThreadIdentityRegistry();
  const location = { pathname: `/local/${clientId}` };
  assert.equal(registry.resolve(location, { hostId: 'local' }).status, 'alias-unresolved');
  assert.equal(registry.remember({ hostId: 'local', clientThreadId: clientId, threadId: coreA }), true);
  assert.equal(registry.resolve(location, { hostId: 'local' }).threadId, coreA);
});

test('别名关联按主机隔离，不复用其他主机的核心线程', () => {
  const registry = createThreadIdentityRegistry();
  registry.remember({ hostId: 'local', clientThreadId: clientId, threadId: coreA });
  const location = { pathname: `/local/${clientId}` };
  assert.equal(registry.resolve(location, { hostId: 'remote-host' }).status, 'alias-unresolved');
  registry.remember({ hostId: 'remote-host', clientThreadId: clientId, threadId: coreB });
  assert.equal(registry.resolve(location, { hostId: 'remote-host' }).threadId, coreB);
  assert.equal(registry.resolve(location, { hostId: 'local' }).threadId, coreA);
});

test('没有已知主机时保持未知；别名查询参数不冒充 AppScope 中的主机', () => {
  const coreRoute = parseLocalThreadRoute({ pathname: `/local/${coreA}` });
  assert.equal(resolveLocalThreadIdentity(coreRoute).status, 'host-unresolved');
  const aliasRoute = parseLocalThreadRoute({ pathname: `/local/${encodeURIComponent(clientId)}`, search: '?hostId=local' });
  assert.equal(aliasRoute.hostId, null);
  assert.equal(resolveLocalThreadIdentity(aliasRoute).status, 'host-unresolved');
});

test('矛盾映射使别名失效，不显示先前或最新猜测的数据', () => {
  const registry = createThreadIdentityRegistry();
  registry.remember({ hostId: 'local', clientThreadId: clientId, threadId: coreA });
  assert.equal(registry.remember({ hostId: 'local', clientThreadId: clientId, threadId: coreB }), false);
  assert.equal(registry.resolve({ pathname: `/local/${clientId}` }, { hostId: 'local' }).status, 'alias-unresolved');
  registry.clear();
  assert.equal(registry.resolve({ pathname: `/local/${clientId}` }, { hostId: 'local' }).status, 'alias-unresolved');
});
