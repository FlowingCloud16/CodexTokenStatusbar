import { COST_USAGE_FIELDS, PRICE_CATALOG, summarizeCosts } from './api-cost.mjs';

const valid = value => Number.isSafeInteger(value) && value >= 0;
const copy = value => value == null ? null : structuredClone(value);
const usageOf = value => value && typeof value === 'object' ? Object.fromEntries([
  ...COST_USAGE_FIELDS, 'total_tokens', 'reasoning_output_tokens', 'cache_write_input_tokens_details', 'input_tokens_details',
].filter(key => Object.hasOwn(value, key)).map(key => [key, copy(value[key])])) : null;

export function createCostAccumulator() {
  let provider = null, expected = null, currentTurnId = null, lastTurnId = null;
  let reset = false, inherited = false, revision = 0, cachedRevision = -1, cached = null;
  const contexts = new Map(), responses = new Map(), turnExpected = new Map();
  function consume(record) {
    const p = record.payload ?? {};
    if (record.type === 'session_meta') {
      provider = typeof p.model_provider === 'string' ? p.model_provider : null;
      inherited = !!(p.forked_from_id || p.forked_from || p.parent_thread_id || p.thread_source === 'fork');
      revision++; return;
    }
    if (record.type === 'turn_context') {
      if (typeof p.turn_id === 'string') contexts.set(p.turn_id, {
        model: typeof p.model === 'string' ? p.model : null,
        provider: typeof p.model_provider === 'string' ? p.model_provider : provider,
        serviceTier: p.service_tier ?? null,
      });
      revision++; return;
    }
    if (record.type === 'event_msg' && ['task_started', 'task_complete'].includes(p.type)) {
      const id = p.turn_id ?? p.root_turn_id;
      if (p.type === 'task_started') currentTurnId = id ?? null;
      else { lastTurnId = id ?? currentTurnId; if (currentTurnId === lastTurnId) currentTurnId = null; }
      revision++; return;
    }
    // 旧载体没有经过核验的逐响应模型归属，不通过累计差额推算它的费用。
    if (record.type !== 'token_usage_record') return;
    const turnId = p.turn_id ?? null;
    const key = typeof p.response_id === 'string' && p.response_id ? p.response_id
      : JSON.stringify(['unidentified', turnId, p.thread_token_usage ?? null, p.usage ?? null]);
    let previous = responses.get(key);
    const nextTotal = usageOf(p.thread_token_usage);
    if (!previous && expected && nextTotal && COST_USAGE_FIELDS.some(field =>
      valid(expected[field]) && valid(nextTotal[field]) && nextTotal[field] < expected[field])) {
      responses.clear(); turnExpected.clear(); reset = true; previous = null;
    }
    if (nextTotal) expected = nextTotal;
    if (p.turn_token_usage && turnId) turnExpected.set(turnId, usageOf(p.turn_token_usage));
    const context = previous ?? contexts.get(turnId) ?? {};
    const entry = {
      model: typeof p.model === 'string' ? p.model : context.model ?? null,
      provider: typeof p.model_provider === 'string' ? p.model_provider : context.provider ?? provider,
      serviceTier: p.service_tier ?? context.serviceTier ?? null,
      turnId, usage: usageOf(p.usage),
      forcedReason: !p.response_id ? 'response-id-missing' : previous && previous.turnId !== turnId ? 'response-conflict' : previous?.forcedReason ?? null,
    };
    // 响应修订替换旧记录；相同 ID 的模型与提供商冲突不取最后一次猜测。
    if (previous && ((p.model && previous.model && p.model !== previous.model)
      || (p.model_provider && previous.provider && p.model_provider !== previous.provider))) entry.forcedReason = 'response-conflict';
    responses.set(key, entry);
    if (!currentTurnId && lastTurnId !== turnId) currentTurnId = turnId;
    revision++;
  }
  function snapshot() {
    if (cachedRevision === revision) return cached;
    const entries = [...responses.values()];
    const reasons = [...(reset ? ['counter-reset'] : []), ...(inherited ? ['inherited-history'] : [])];
    const turn = id => id ? { turnId: id, ...summarizeCosts(entries.filter(entry => entry.turnId === id), turnExpected.get(id), reasons) } : null;
    cached = {
      currency: 'USD', scale: 12, priceVersion: PRICE_CATALOG.version, source: PRICE_CATALOG.source,
      sourceKind: 'verified-response-records', total: summarizeCosts(entries, expected, reasons),
      currentTurn: turn(currentTurnId), lastTurn: turn(lastTurnId),
    };
    cachedRevision = revision; return cached;
  }
  return { consume, snapshot };
}
