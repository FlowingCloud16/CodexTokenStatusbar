import test from 'node:test';
import assert from 'node:assert/strict';
import { connectPageAdapter, discoverRuntimeEntries } from '../src/page-adapter.mjs';

const CORE = '01a1ba45-994e-75f3-ac70-6be9853c67b9';
const OTHER = '01a1ba45-994e-75f3-ac70-6be9853c67b8';
function fixture() {
  const definition = { id: Symbol('existing-app-scope') };
  const locationAtom = Symbol('location');
  const aliasAtom = Symbol('alias');
  const node = { location: { pathname: `/local/${CORE}`, search: '' }, selected: { id: CORE, hostId: 'local' }, mapped: CORE };
  const chain = new Map([[definition.id, node]]);
  const footer = { __reactFiber$test: { return: { memoizedProps: { value: chain }, return: null } }, parentElement: null };
  Object.assign(footer, { isConnected: true, closest: () => null, checkVisibility: () => true, getBoundingClientRect: () => ({ width: 736, height: 28 }) });
  const footers = [footer];
  const interceptors = new Set();
  let wrapperCount = 0;
  const modules = {
    OWtl: { u: definition },
    GNwQ: { GB: (def, actualChain, actualNode) => {
      assert.equal(def, definition); assert.equal(actualChain, chain); assert.equal(actualNode, node); wrapperCount++;
      return { get: (atom, id) => atom === locationAtom ? node.location : atom === aliasAtom ? (id ? node.mapped : null) : null };
    } },
    nlNF: { x2: locationAtom }, V3rO: { Tl: aliasAtom }, gp55: { oE: () => node.selected },
    TL6G: { O1: { interceptHostMessages: listener => { interceptors.add(listener); return () => interceptors.delete(listener); } } },
  };
  const cache = Object.fromEntries(Object.entries(modules).map(([id, exports]) => [id, { exports }]));
  const require = () => { throw new Error('适配器不得 require 未缓存业务模块'); };
  require.c = cache;
  const pageWindow = { Map, location: { href: 'app://-/index.html', origin: 'app://-' }, document: { scripts: [{ type: 'module', src: '/assets/348410.792d1c9584.js' }], querySelectorAll: () => footers } };
  return { node, footer, footers, interceptors, wrapperCount: () => wrapperCount, options: { pageWindow, importRuntime: async url => { assert.equal(url, 'app://-/assets/348410.792d1c9584.js'); return { __webpack_require__: require }; } } };
}
test('保留的隐藏输入框不提供身份，无可见输入框时不继续复用旧 scope', async () => {
  const f = fixture();
  f.footers.unshift({ ...f.footer, checkVisibility: () => false, __reactFiber$test: null });
  const adapter = await connectPageAdapter(f.options);
  assert.equal(adapter.readActiveIdentity().threadId, CORE);
  f.footer.checkVisibility = () => false;
  assert.equal(adapter.readActiveIdentity().status, 'mounted-scope-not-found');
  f.footer.checkVisibility = () => true;
  f.footer.getBoundingClientRect = () => ({ width: 0, height: 0 });
  assert.equal(adapter.readActiveIdentity().status, 'mounted-scope-not-found');
  f.footer.getBoundingClientRect = () => ({ width: 736, height: 28 });
  f.footer.closest = () => ({});
  assert.equal(adapter.readActiveIdentity().status, 'mounted-scope-not-found');
  f.footer.closest = () => null;
  assert.equal(adapter.readActiveIdentity().threadId, CORE);
  adapter.dispose();
});

test('客户端入口改名后只复用页面已有同源模块，不请求猜测的旧入口', async () => {
  const f = fixture();
  const original = f.options.importRuntime;
  f.options.pageWindow.document.scripts = [
    { type: 'module', src: 'https://other.example/remote.js' },
    { type: '', src: '/assets/classic.js' },
    { type: 'module', src: '/assets/updated.unknown.mjs' },
  ];
  assert.deepEqual(discoverRuntimeEntries(f.options.pageWindow), ['app://-/assets/updated.unknown.mjs']);
  f.options.importRuntime = url => {
    assert.equal(url, 'app://-/assets/updated.unknown.mjs');
    return original('app://-/assets/348410.792d1c9584.js');
  };
  const adapter = await connectPageAdapter(f.options);
  assert.equal(adapter.readActiveIdentity().threadId, CORE);
  adapter.dispose();
});

test('没有可用缓存时明确失败，已有入口模块异常时可继续查找后续入口', async () => {
  const f = fixture();
  const original = f.options.importRuntime;
  f.options.pageWindow.document.scripts.unshift({ type: 'module', src: '/assets/no-runtime.js' });
  f.options.importRuntime = url => url.endsWith('no-runtime.js') ? Promise.reject(new Error('无导出')) : original(url);
  const adapter = await connectPageAdapter(f.options);
  assert.equal(adapter.readActiveIdentity().status, 'resolved'); adapter.dispose();
  f.options.pageWindow.document.scripts = [];
  await assert.rejects(connectPageAdapter(f.options), /模块缓存/);
});
test('通过现有 Provider Map 读取核心身份，不初始化新 store 或模块', async () => {
  const f = fixture(); const adapter = await connectPageAdapter(f.options);
  assert.equal(adapter.readActiveIdentity().threadId, CORE);
  assert.equal(adapter.readActiveIdentity().source, 'mounted-app-scope');
  assert.equal(f.wrapperCount(), 1);
  f.node.location.pathname = '/';
  assert.equal(adapter.readActiveIdentity().status, 'unsupported-route');
  adapter.dispose();
});
test('新建对话必须经显式映射，路由或主机冲突时不输出身份', async () => {
  const f = fixture(); const adapter = await connectPageAdapter(f.options);
  f.node.location.pathname = `/local/client-new-thread:${OTHER}`;
  f.node.selected = null;
  assert.equal(adapter.readActiveIdentity().status, 'alias-unresolved');
  f.node.selected = { id: CORE, hostId: 'local' };
  assert.equal(adapter.readActiveIdentity().threadId, CORE);
  f.node.mapped = OTHER;
  assert.equal(adapter.readActiveIdentity().status, 'identity-conflict');
  f.node.location = { pathname: `/local/${CORE}`, search: '?hostId=remote' };
  assert.equal(adapter.readActiveIdentity().status, 'host-conflict');
  adapter.dispose();
});
test('被动拦截器始终返回 false，卸载移除自己的监听器', async () => {
  const f = fixture(); const adapter = await connectPageAdapter(f.options);
  let received = 0;
  adapter.subscribeMessages(() => { received++; });
  const listener = [...f.interceptors][0];
  assert.equal(listener({ type: 'mcp-notification' }), false);
  assert.equal(received, 1);
  adapter.dispose();
  assert.equal(f.interceptors.size, 0);
  assert.equal(adapter.readActiveIdentity().status, 'disposed');
});
