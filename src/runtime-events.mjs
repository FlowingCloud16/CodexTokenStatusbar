// 这个函数会以源码形式送入页面，因此保持自包含，只返回脱敏的结构信息。
export function summarizePageMessage(data) {
  if (!data || typeof data !== 'object') return null;
  const fields = value => value && typeof value === 'object' ? Object.keys(value).slice(0, 24) : [];
  const identifier = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) ? value : null;
  const usage = value => {
    if (!value || typeof value !== 'object') return null;
    const result = {};
    for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens']) {
      result[key] = Number.isSafeInteger(value[key]) && value[key] >= 0 ? value[key] : null;
    }
    return result;
  };
  if (data.marker === 'codex-host-chunked-message-v1') return {
    type: 'serialized-message-chunk', kind: ['start', 'chunk', 'end'].includes(data.kind) ? data.kind : null,
    transportUnitCount: Array.isArray(data.tokens) ? data.tokens.length : null,
  };
  if (typeof data.type !== 'string' || data.type.length > 120) return null;
  const result = { type: data.type, keys: fields(data) };
  if (data.type !== 'mcp-notification') return result;
  if (typeof data.method !== 'string' || !/^[a-zA-Z0-9/_-]{1,120}$/.test(data.method)) return result;
  const params = data.params ?? {};
  result.method = data.method;
  result.paramKeys = fields(params);
  result.threadId = identifier(params.threadId);
  result.turnId = identifier(params.turnId ?? params.turn?.id);
  if (data.method === 'thread/tokenUsage/updated') result.tokenUsage = {
    keys: fields(params.tokenUsage),
    total: usage(params.tokenUsage?.total), last: usage(params.tokenUsage?.last),
  };
  if (data.method === 'item/agentMessage/delta') {
    // 文本长度只用于验证流式事件；绝不能把片段数或字符数当成 token 数。
    result.deltaCharacters = typeof params.delta === 'string' ? params.delta.length : null;
    result.characterUnit = 'utf16-code-units';
  }
  return result;
}
