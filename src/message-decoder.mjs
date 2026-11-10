// 观察副本独立重组分片；不向客户端发送 ACK，避免干扰原接收器。
export function createMessageDecoder({ maxUnits = 100000, maxCharacters = 2 * 1024 * 1024, maxDepth = 64, timeoutMs = 30000, now = Date.now } = {}) {
  const transfers = new Map();
  const diagnostics = { incomplete: 0, rejected: 0, completed: 0 };
  function reject(id) { transfers.delete(id); diagnostics.rejected++; return null; }
  function receive(message) {
    const time = now();
    for (const [id, state] of transfers) if (time - state.updatedAt > timeoutMs) { transfers.delete(id); diagnostics.incomplete++; }
    if (message?.marker !== 'codex-host-chunked-message-v1') return message;
    const { transferId: id, sequence, kind } = message;
    if (typeof id !== 'string' || id.length > 200 || !Number.isSafeInteger(sequence) || sequence < 0) return reject(id);
    if (kind === 'start') {
      // 当前版本发送器按单传输流运行；新 start 使未完成的旧传输失效。
      diagnostics.incomplete += transfers.size;
      transfers.clear();
      transfers.set(id, { next: sequence + 1, stack: [], root: undefined, hasRoot: false, chunks: null, target: null, units: 0, characters: 0, updatedAt: time });
      return null;
    }
    const state = transfers.get(id);
    if (!state || sequence !== state.next) return reject(id);
    state.next++;
    state.updatedAt = time;
    const addText = value => {
      if (typeof value !== 'string') throw new Error('序列化文本类型无效');
      state.characters += value.length;
      if (state.characters > maxCharacters) throw new Error('分片文本超出观察预算');
      return value;
    };
    const setKey = key => {
      const parent = state.stack.at(-1);
      if (!parent || parent.type !== 'object' || parent.key !== null) throw new Error('对象键顺序无效');
      parent.key = key;
    };
    const save = value => {
      const parent = state.stack.at(-1);
      if (!parent) {
        if (state.hasRoot) throw new Error('重复根对象');
        state.root = value;
        state.hasRoot = true;
      } else if (parent.type === 'array') parent.value.push(value);
      else {
        if (parent.key === null) throw new Error('对象值缺少键');
        Object.defineProperty(parent.value, parent.key, { configurable: true, enumerable: true, writable: true, value });
        parent.key = null;
      }
    };
    try {
      if (kind === 'chunk') {
        if (!Array.isArray(message.tokens) || state.units + message.tokens.length > maxUnits) throw new Error('分片单元超出观察预算');
        state.units += message.tokens.length;
        for (const unit of message.tokens) {
          if (!unit || typeof unit !== 'object') throw new Error('序列化单元无效');
          switch (unit.type) {
            case 'array-start': case 'object-start': {
              if (state.chunks || state.stack.length >= maxDepth) throw new Error('嵌套深度超限');
              const value = unit.type === 'array-start' ? [] : {};
              save(value);
              state.stack.push({ type: unit.type === 'array-start' ? 'array' : 'object', value, key: null });
              break;
            }
            case 'container-end': {
              const parent = state.stack.pop();
              if (!parent || parent.key !== null || state.chunks) throw new Error('容器未完成');
              break;
            }
            case 'key': setKey(addText(unit.value)); break;
            case 'value':
              if (state.chunks || !(unit.value == null || ['string', 'boolean', 'number'].includes(typeof unit.value))) throw new Error('非标量序列化值');
              save(typeof unit.value === 'string' ? addText(unit.value) : unit.value);
              break;
            case 'string-start':
              if (state.chunks || !['key', 'value'].includes(unit.target)) throw new Error('字符串起始无效');
              state.chunks = []; state.target = unit.target; break;
            case 'string-chunk':
              if (!state.chunks) throw new Error('字符串缺少起始');
              state.chunks.push(addText(unit.value)); break;
            case 'string-end': {
              if (!state.chunks) throw new Error('字符串缺少起始');
              const value = state.chunks.join('');
              state.target === 'key' ? setKey(value) : save(value);
              state.chunks = null; state.target = null; break;
            }
            default: throw new Error('未知序列化单元');
          }
        }
        return null;
      }
      if (kind !== 'end' || !state.hasRoot || state.stack.length || state.chunks) throw new Error('传输未完成');
      transfers.delete(id);
      diagnostics.completed++;
      return state.root;
    } catch { return reject(id); }
  }
  return { receive, inspect: () => ({ ...diagnostics, pending: transfers.size }), dispose: () => transfers.clear() };
}
