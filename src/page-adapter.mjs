import { parseLocalThreadRoute, isCoreThreadId } from './thread-identity.mjs';
import { createMessageDecoder } from './message-decoder.mjs';

export function discoverRuntimeEntries(pageWindow) {
  const current = new URL(pageWindow.location.href);
  return [...new Set([...pageWindow.document.scripts].flatMap(script => {
    if (!script.src || script.type !== 'module') return [];
    try {
      const url = new URL(script.src, current);
      return url.protocol === current.protocol && url.host === current.host && /\.(?:m?js)$/.test(url.pathname) ? [url.href] : [];
    } catch { return []; }
  }))].slice(0, 8);
}

// 只取已缓存模块；不调用 require 初始化未加载的业务模块。
export async function connectPageAdapter({ pageWindow = window, importRuntime = url => import(url) } = {}) {
  // 只重新引用页面已有的同源模块入口，ESM 复用现有实例，不猜测旧版脚本路径。
  let require = null;
  for (const url of discoverRuntimeEntries(pageWindow)) {
    try {
      const runtime = await importRuntime(url);
      if (runtime.__webpack_require__?.c) { require = runtime.__webpack_require__; break; }
    } catch { /* 单个入口没有导出运行时，继续检查页面中其他已有入口。 */ }
  }
  if (!require) throw new Error('当前页面入口尚未提供可读取的模块缓存。');
  const cached = id => require?.c?.[id]?.exports;
  const required = ['OWtl', 'GNwQ', 'nlNF', 'gp55', 'V3rO'];
  const modulesReady = () => required.every(id => cached(id) != null);
  let wrapperCache = null;
  let disposed = false;
  const removers = new Set();

  function findScope() {
    if (!modulesReady()) return null;
    const definition = cached('OWtl').u;
    const wrap = cached('GNwQ').GB;
    // 与状态栏挂载使用相同的可见性条件，跳过仍留在 DOM 内的后台对话。
    const footer = [...pageWindow.document.querySelectorAll('[data-composer-footer-responsive], .ComposerFooter-WlpjXt')].find(element => {
      if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      if (element.checkVisibility?.({ checkVisibilityCSS: true, contentVisibilityAuto: true }) === false) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!definition?.id || typeof wrap !== 'function' || !footer) return null;
    let element = footer;
    for (let depth = 0; element && depth < 12; depth++, element = element.parentElement) {
      const key = Object.getOwnPropertyNames(element).find(name => name.startsWith('__reactFiber$'));
      let fiber = key ? element[key] : null;
      const seen = new Set();
      for (let count = 0; fiber && count < 150 && !seen.has(fiber); count++, fiber = fiber.return) {
        seen.add(fiber);
        const chain = fiber.memoizedProps?.value;
        if (!(chain instanceof pageWindow.Map) || !chain.has(definition.id)) continue;
        const node = chain.get(definition.id);
        if (!node) continue;
        if (wrapperCache?.chain === chain && wrapperCache.node === node) return wrapperCache.get;
        // GB 包装已有 scopeNode；不创建 scope/store，也不调用 set/watch。
        const wrapper = wrap(definition, chain, node);
        if (typeof wrapper?.get !== 'function') continue;
        wrapperCache = { chain, node, get: wrapper.get };
        return wrapper.get;
      }
    }
    return null;
  }

  function readActiveIdentity() {
    if (disposed) return { status: 'disposed', threadId: null, hostId: null };
    if (!modulesReady()) return { status: 'modules-not-loaded', threadId: null, hostId: null };
    try {
      const get = findScope();
      if (!get) return { status: 'mounted-scope-not-found', threadId: null, hostId: null };
      const location = get(cached('nlNF').x2);
      const route = parseLocalThreadRoute(location);
      if (!route) return { status: 'unsupported-route', threadId: null, hostId: null };
      const selected = cached('gp55').oE(get);
      if (!selected || !isCoreThreadId(selected.id) || typeof selected.hostId !== 'string' || !selected.hostId) {
        return { status: route.routeKind === 'client-local-thread' ? 'alias-unresolved' : 'identity-unresolved', threadId: null, hostId: null };
      }
      if (route.hostId && route.hostId !== selected.hostId) return { status: 'host-conflict', threadId: null, hostId: null };
      const mapped = route.routeKind === 'client-local-thread' ? get(cached('V3rO').Tl, route.clientThreadId) : route.threadId;
      if (mapped !== selected.id) return { status: 'identity-conflict', threadId: null, hostId: null };
      return { status: 'resolved', threadId: selected.id, hostId: selected.hostId, source: 'mounted-app-scope', routeKind: route.routeKind };
    } catch {
      return { status: 'scope-read-failed', threadId: null, hostId: null };
    }
  }

  function subscribeMessages(listener) {
    const dispatcher = cached('TL6G')?.O1;
    let remove;
    if (typeof dispatcher?.interceptHostMessages === 'function') {
      remove = dispatcher.interceptHostMessages(message => {
        try { listener(message); } catch { /* 组件错误不能中断客户端消息分发。 */ }
        return false;
      });
    } else {
      const decoder = createMessageDecoder();
      const handler = event => {
        if (event.source != null && event.source !== pageWindow) return;
        if (event.source === pageWindow && event.origin && event.origin !== pageWindow.location.origin) return;
        try { const message = decoder.receive(event.data); if (message) listener(message); } catch { /* 丢弃异常观察副本。 */ }
      };
      pageWindow.addEventListener('message', handler);
      remove = () => { pageWindow.removeEventListener('message', handler); decoder.dispose(); };
    }
    let removed = false;
    const cleanup = () => { if (!removed) { removed = true; remove(); removers.delete(cleanup); } };
    removers.add(cleanup);
    return cleanup;
  }

  return {
    readActiveIdentity, subscribeMessages,
    inspect: () => ({ modulesReady: modulesReady(), source: 'loaded-module-cache-and-mounted-scope', active: readActiveIdentity() }),
    dispose() { disposed = true; for (const remove of [...removers]) remove(); wrapperCache = null; },
  };
}
