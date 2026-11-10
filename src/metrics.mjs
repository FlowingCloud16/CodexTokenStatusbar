import { createCostAccumulator } from './cost-accumulator.mjs';
const USAGE_FIELDS = [
  'input_tokens', 'cached_input_tokens', 'cache_write_input_tokens',
  'output_tokens', 'reasoning_output_tokens', 'total_tokens',
];

const validNumber = value => Number.isSafeInteger(value) && value >= 0;
const clone = value => value == null ? null : structuredClone(value);
const emptyUsage = () => Object.fromEntries(USAGE_FIELDS.map(key => [key, 0]));

export function normalizeUsage(value) {
  if (!value || typeof value !== 'object') return null;
  const result = Object.fromEntries(USAGE_FIELDS.map(key => [key, validNumber(value[key]) ? value[key] : null]));
  if (result.total_tokens == null && result.input_tokens != null && result.output_tokens != null) {
    result.total_tokens = result.input_tokens + result.output_tokens;
  }
  return result.input_tokens == null && result.output_tokens == null ? null : result;
}

export function cacheHitRate(usage) {
  if (!usage || !(usage.input_tokens > 0) || usage.cached_input_tokens == null) return null;
  return usage.cached_input_tokens / usage.input_tokens * 100;
}

function addUsage(values) {
  if (!values.length) return null;
  return Object.fromEntries(USAGE_FIELDS.map(key => [key,
    values.every(value => value[key] != null) ? values.reduce((sum, value) => sum + value[key], 0) : null,
  ]));
}

function subtractUsage(total, baseline) {
  if (!total || !baseline) return null;
  const value = Object.fromEntries(USAGE_FIELDS.map(key => [key,
    total[key] != null && baseline[key] != null && total[key] >= baseline[key] ? total[key] - baseline[key] : null,
  ]));
  return value.input_tokens == null || value.output_tokens == null ? null : value;
}

function toTime(value, numericUnit) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (numericUnit === 'seconds') return value * 1000;
    if (numericUnit === 'milliseconds') return value;
    return null;
  }
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function usageKey(usage) {
  return usage ? USAGE_FIELDS.map(key => usage[key] ?? '?').join(':') : null;
}

const turnUsage = turn => turn.officialUsage ?? turn.deltaUsage ?? addUsage([...turn.responses.values()].map(response => response.usage));

function publicTurn(turn) {
  if (!turn) return null;
  const usage = turnUsage(turn);
  return {
    id: turn.id,
    usage: clone(usage),
    cacheHitRate: cacheHitRate(usage),
    responseCount: turn.responses.size,
    status: turn.status,
    startedAtMs: turn.startedAtMs,
    completedAtMs: turn.completedAtMs,
    durationMs: turn.durationMs,
    timeToFirstTokenMs: turn.timeToFirstTokenMs,
    usageUpdatedAtMs: turn.usageUpdatedAtMs,
    coverage: turn.officialUsage || turn.deltaUsage ? 'complete' : 'observed-responses-only',
  };
}

// 日志中的项目计时没有响应标识；只接受可直接归属的计时，不按相邻事件猜测。
function responseSpeed(response, timing) {
  if (!response || !timing || !(timing.completedAtMs > timing.startedAtMs) || response.usage.output_tokens == null) return null;
  return {
    value: response.usage.output_tokens / ((timing.completedAtMs - timing.startedAtMs) / 1000),
    unit: 't/s',
    basis: 'response-output-including-reasoning',
    source: 'explicit-response-timing',
    estimated: false,
    live: false,
    responseId: response.id,
    durationMs: timing.completedAtMs - timing.startedAtMs,
  };
}

export function createMetricsAccumulator({ threadId = null } = {}) {
  const costs = createCostAccumulator();
  let total = null;
  let currentTurnId = null;
  let lastTurnId = null;
  let latestResponse = null;
  let updatedAt = null;
  let totalUpdatedAt = null;
  let sawSessionMeta = false;
  let hasModernUsage = false;
  const turns = new Map();
  const responseAliases = new Map();
  const responseTimings = new Map();
  const diagnostics = { malformedLines: 0, duplicateUsageEvents: 0, ignoredForeignThreadEvents: 0, ignoredLegacyUsageEvents: 0 };

  function getTurn(id) {
    if (!id) return null;
    if (!turns.has(id)) turns.set(id, {
      id, baseline: null, responses: new Map(), officialUsage: null, deltaUsage: null,
      status: 'running', startedAtMs: null, completedAtMs: null, durationMs: null, timeToFirstTokenMs: null,
      usageUpdatedAtMs: null,
    });
    return turns.get(id);
  }

  function consume(record) {
    if (typeof record === 'string') {
      try { record = JSON.parse(record); } catch { diagnostics.malformedLines++; return; }
    }
    if (!record || typeof record !== 'object') return;
    const p = record.payload ?? {};
    if (record.type === 'session_meta') {
      if (threadId && p.id && p.id !== threadId) { diagnostics.ignoredForeignThreadEvents++; return; }
      threadId ??= p.id ?? null;
      sawSessionMeta = true;
      costs.consume(record);
      return;
    }
    if (threadId && p.thread_id && p.thread_id !== threadId) { diagnostics.ignoredForeignThreadEvents++; return; }
    costs.consume(record);
    if (record.type === 'event_msg' && p.type === 'task_started') {
      currentTurnId = p.turn_id ?? p.root_turn_id ?? null;
      const turn = getTurn(currentTurnId);
      if (!turn) return;
      if (turn.startedAtMs == null) {
        turn.startedAtMs = toTime(p.started_at, 'seconds') ?? toTime(record.timestamp);
        turn.baseline = clone(total ?? (sawSessionMeta ? emptyUsage() : null));
      }
      updatedAt = record.timestamp ?? updatedAt;
      return;
    }
    if (record.type === 'event_msg' && p.type === 'task_complete') {
      const id = p.turn_id ?? p.root_turn_id ?? currentTurnId;
      const turn = getTurn(id);
      if (!turn) return;
      turn.status = 'completed';
      turn.completedAtMs = toTime(p.completed_at, 'seconds') ?? toTime(record.timestamp);
      turn.startedAtMs ??= toTime(p.started_at, 'seconds');
      turn.durationMs = validNumber(p.duration_ms) ? p.duration_ms : null;
      turn.timeToFirstTokenMs = validNumber(p.time_to_first_token_ms) ? p.time_to_first_token_ms : null;
      lastTurnId = id;
      if (currentTurnId === id) currentTurnId = null;
      updatedAt = record.timestamp ?? updatedAt;
      return;
    }

    // 运行时适配器可以补充显式响应计时；现有磁盘日志中没有观察到此事件。
    if (record.type === 'response_timing' && p.response_id) {
      const startedAtMs = toTime(p.started_at_ms, 'milliseconds');
      const completedAtMs = toTime(p.completed_at_ms, 'milliseconds');
      if (startedAtMs != null && completedAtMs > startedAtMs) {
        responseTimings.set(p.response_id, { startedAtMs, completedAtMs });
      }
      return;
    }

    const isModern = record.type === 'token_usage_record';
    const isLegacy = record.type === 'event_msg' && p.type === 'token_count';
    if (!isModern && !isLegacy) return;
    const nextTotal = normalizeUsage(isModern ? p.thread_token_usage : p.info?.total_token_usage);
    const responseUsage = normalizeUsage(isModern ? p.usage : p.info?.last_token_usage);
    // 两种载体的累计值可能因历史恢复而不同；取得现代累计后，不再让旧载体覆盖或补加响应。
    if (isLegacy && hasModernUsage) {
      if (nextTotal && usageKey(nextTotal) === usageKey(total)) diagnostics.duplicateUsageEvents++;
      else diagnostics.ignoredLegacyUsageEvents++;
      return;
    }
    if (isModern && nextTotal) hasModernUsage = true;
    const previousTotal = total;
    if (nextTotal) {
      total = nextTotal;
      // 轮次开始、结束和重复通知不能把旧累计伪装成新用量。
      if (usageKey(nextTotal) !== usageKey(previousTotal)) totalUpdatedAt = record.timestamp ?? null;
    }
    const id = p.turn_id ?? currentTurnId;
    const turn = getTurn(id);
    const previousTurnUsage = turn ? usageKey(turnUsage(turn)) : null;
    if (id && currentTurnId == null && turn?.status !== 'completed') currentTurnId = id;
    if (turn) {
      turn.deltaUsage = subtractUsage(total, turn.baseline);
      const officialTurn = isModern ? normalizeUsage(p.turn_token_usage) : null;
      if (!isModern && usageKey(nextTotal) !== usageKey(previousTotal)) turn.officialUsage = null;
      // 部分旧版本把 thread 累计复制到 turn；有基线时以实际差值核验该情形。
      if (officialTurn) {
        const looksLikeThreadCopy = usageKey(officialTurn) === usageKey(nextTotal)
          && turn.baseline?.total_tokens > 0;
        if (!looksLikeThreadCopy) turn.officialUsage = officialTurn;
      }
    }

    if (responseUsage && turn) {
      const cumulativeAlias = nextTotal ? `${id}|${usageKey(nextTotal)}` : null;
      const explicitKey = p.response_id ? `${id}|${p.response_id}` : null;
      const knownKey = explicitKey && turn.responses.has(explicitKey) ? explicitKey
        : cumulativeAlias ? responseAliases.get(cumulativeAlias) : null;
      const key = knownKey ?? explicitKey ?? cumulativeAlias;
      if (key) {
        if (turn.responses.has(key)) diagnostics.duplicateUsageEvents++;
        const response = {
          id: p.response_id ?? turn.responses.get(key)?.id ?? null,
          turnId: id, usage: responseUsage, timestamp: record.timestamp ?? null,
        };
        turn.responses.set(key, response);
        if (cumulativeAlias) responseAliases.set(cumulativeAlias, key);
        latestResponse = response;
      }
    }
    // 同一计数的重复通知不推进采样时间；新计数没有有效时间时清除旧时间，避免错配。
    if (turn && usageKey(turnUsage(turn)) !== previousTurnUsage) turn.usageUpdatedAtMs = toTime(record.timestamp);
    if (nextTotal || responseUsage) updatedAt = record.timestamp ?? updatedAt;
    if (!nextTotal && !responseUsage) total = previousTotal;
  }

  function snapshot() {
    const currentTurn = publicTurn(turns.get(currentTurnId));
    const lastTurn = publicTurn(turns.get(lastTurnId));
    return {
      threadId, total: clone(total), cacheHitRate: cacheHitRate(total), currentTurn, lastTurn, cost: clone(costs.snapshot()),
      latestResponse: clone(latestResponse),
      speed: responseSpeed(latestResponse, responseTimings.get(latestResponse?.id)),
      endToEndSpeed: lastTurn?.usage?.output_tokens != null && lastTurn.durationMs > 0 ? {
        value: lastTurn.usage.output_tokens / (lastTurn.durationMs / 1000),
        unit: 't/s', basis: 'whole-turn-including-waiting-and-tools',
        source: 'task_complete.duration_ms', estimated: false, live: false,
      } : null,
      updatedAt, totalUpdatedAt, diagnostics: clone(diagnostics),
    };
  }
  return { consume, snapshot };
}

export function parseRollout(text, options = {}) {
  const accumulator = createMetricsAccumulator(options);
  for (const line of text.split(/\r?\n/)) if (line.trim()) accumulator.consume(line);
  return accumulator.snapshot();
}
