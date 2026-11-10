export const CLIENT_THREAD_PREFIX = 'client-new-thread:';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const validHost = value => typeof value === 'string' && value.length > 0 && value.length <= 512;
export const isCoreThreadId = value => typeof value === 'string' && UUID.test(value);
export const isClientThreadId = value => typeof value === 'string'
  && value.startsWith(CLIENT_THREAD_PREFIX) && UUID.test(value.slice(CLIENT_THREAD_PREFIX.length));

// 路由常量来自当前版本 DBCl -> tRL3；不搜索路径中的任意 UUID。
export function parseLocalThreadRoute({ pathname = '', search = '' } = {}) {
  if (typeof pathname !== 'string' || typeof search !== 'string') return null;
  const match = /^(?:\/local|\/hotkey-window\/thread)\/([^/?#]+)$/.exec(pathname);
  if (!match) return null;
  let id;
  try { id = decodeURIComponent(match[1]); } catch { return null; }
  const params = new URLSearchParams(search);
  const hosts = params.getAll('hostId');
  if (hosts.length > 1 || (hosts.length && !validHost(hosts[0]))) return null;
  if (isClientThreadId(id)) return {
    routeKind: 'client-local-thread', clientThreadId: id,
    // 当前客户端的别名分支不从查询参数得出主机，必须靠既有 AppScope。
    hostId: null,
  };
  if (!isCoreThreadId(id)) return null;
  return { routeKind: 'local-thread', threadId: id, hostId: hosts[0] ?? null };
}

export function resolveLocalThreadIdentity(route, { hostId = null, aliases = null } = {}) {
  if (!route) return { status: 'unsupported-route', threadId: null, hostId: null };
  const effectiveHost = route.hostId ?? hostId;
  if (!validHost(effectiveHost)) return { status: 'host-unresolved', threadId: null, hostId: null };
  if (route.routeKind === 'local-thread' && isCoreThreadId(route.threadId)) return {
    status: 'resolved', threadId: route.threadId, hostId: effectiveHost, source: 'core-route',
  };
  if (route.routeKind === 'client-local-thread' && isClientThreadId(route.clientThreadId)) {
    const key = JSON.stringify([effectiveHost, route.clientThreadId]);
    const threadId = aliases instanceof Map ? aliases.get(key) : null;
    if (isCoreThreadId(threadId)) return {
      status: 'resolved', threadId, hostId: effectiveHost, source: 'explicit-alias-binding',
    };
    return { status: 'alias-unresolved', threadId: null, hostId: effectiveHost };
  }
  return { status: 'unsupported-route', threadId: null, hostId: effectiveHost };
}

// 这个注册表只接受运行时适配器给出的显式关联；它不根据时间或 URL 猜测关联。
export function createThreadIdentityRegistry() {
  const aliases = new Map();
  return {
    remember({ hostId, clientThreadId, threadId } = {}) {
      if (!validHost(hostId) || !isClientThreadId(clientThreadId) || !isCoreThreadId(threadId)) return false;
      const key = JSON.stringify([hostId, clientThreadId]);
      if (aliases.has(key) && aliases.get(key) !== threadId) {
        aliases.set(key, null);
        return false;
      }
      aliases.set(key, threadId);
      return true;
    },
    resolve(location, options = {}) {
      return resolveLocalThreadIdentity(parseLocalThreadRoute(location), { ...options, aliases });
    },
    clear() { aliases.clear(); },
  };
}
