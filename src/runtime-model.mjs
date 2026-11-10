import { createMetricsAccumulator, cacheHitRate } from './metrics.mjs';
import { isCoreThreadId } from './thread-identity.mjs';
import { estimateTurnRate } from './turn-rate.mjs';
import { reconcileCostSummary } from './api-cost.mjs';

const keyFor = identity => JSON.stringify([identity.hostId, identity.threadId]);
const at = value => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
};
const usageFields = ['input_tokens', 'output_tokens', 'total_tokens'];
const sameUsage = (a, b) => usageFields.every(field => a?.[field] === b?.[field]);

function mergeSnapshots(live, offline, nowMs) {
  const views = [{ value: live, source: 'live' }, { value: offline, source: 'log' }]
    .filter(view => view.value).sort((a, b) => at(b.value.updatedAt) - at(a.value.updatedAt) || (a.source === 'log' ? -1 : 1));
  const countAt = view => at(Object.hasOwn(view.value, 'totalUpdatedAt') ? view.value.totalUpdatedAt : view.value.updatedAt);
  const countViews = views.filter(view => view.value.total)
    .sort((a, b) => countAt(b) - countAt(a) || (a.source === 'log' ? -1 : 1));
  const counts = countViews[0]?.value;
  const reset = countViews.length > 1 && ['input_tokens', 'output_tokens'].some(field =>
    Number.isSafeInteger(counts.total[field]) && Number.isSafeInteger(countViews[1].value.total[field]) && counts.total[field] < countViews[1].value.total[field]);
  // 累计值可以领先速度采样；计数重置时不继续使用重置前的轮次证据。
  const turnViews = reset ? countViews.slice(0, 1) : views;
  const entries = turnViews.flatMap(view => ['currentTurn', 'lastTurn'].flatMap(key => view.value[key]?.id ? [{
    ...view, turn: view.value[key], completed: key === 'lastTurn' || view.value[key].status === 'completed',
  }] : []));
  const started = id => Math.max(...entries.filter(entry => entry.turn.id === id).map(entry => at(entry.turn.startedAtMs)));
  const heads = turnViews.map(view => ({ ...view, head: view.value.currentTurn ?? view.value.lastTurn })).filter(view => view.head?.id);
  // 两边都知道开始时间时按轮次先后选择，迟到的旧轮次不能抢回当前绑定。
  heads.sort((a, b) => {
    const x = started(a.head.id), y = started(b.head.id);
    return Number.isFinite(x) && Number.isFinite(y) && x !== y ? y - x : at(b.value.updatedAt) - at(a.value.updatedAt);
  });
  function choose(id) {
    const candidates = entries.filter(entry => entry.turn.id === id);
    const completed = candidates.filter(entry => entry.completed);
    const final = completed.filter(entry => estimateTurnRate({ lastTurn: entry.turn }, nowMs));
    if (final.length) return { entry: final.find(entry => entry.source === 'log') ?? final[0], completed: true };
    const sampled = candidates.filter(entry => estimateTurnRate({ currentTurn: entry.turn }, nowMs))
      .sort((a, b) => at(b.turn.usageUpdatedAtMs) - at(a.turn.usageUpdatedAtMs));
    if (sampled.length) {
      const latest = sampled[0];
      // 相同用量优先采用正式日志采样，重复通知的到达时间不充当新的采样时间。
      const selected = sampled.find(entry => entry.source === 'log' && sameUsage(entry.turn.usage, latest.turn.usage)) ?? latest;
      // 只有完成通知但缺最终用量时，先保留完整采样，等正式完成快照再切换整轮均速。
      return { entry: selected, completed: false };
    }
    return candidates.length ? { entry: completed.find(entry => entry.source === 'log') ?? completed[0] ?? candidates[0], completed: completed.length > 0 } : null;
  }
  const head = heads.length ? choose(heads[0].head.id) : null;
  const previous = entries.filter(entry => entry.completed && entry.turn.id !== head?.entry.turn.id)
    .sort((a, b) => at(b.turn.completedAtMs ?? b.turn.startedAtMs) - at(a.turn.completedAtMs ?? a.turn.startedAtMs));
  const last = head?.completed ? head.entry.turn : previous.length ? choose(previous[0].turn.id)?.entry.turn : null;
  const combined = Object.assign({}, ...views.slice().reverse().map(view => view.value));
  combined.total = counts?.total ?? null;
  combined.totalUpdatedAt = counts?.totalUpdatedAt ?? counts?.updatedAt ?? null;
  combined.cacheHitRate = cacheHitRate(combined.total);
  combined.currentTurn = head && !head.completed ? head.entry.turn : null;
  combined.lastTurn = last ?? null;
  combined.endToEndSpeed = last?.usage?.output_tokens != null && last.durationMs > 0 ? {
    value: last.usage.output_tokens / (last.durationMs / 1000), unit: 't/s',
    basis: 'whole-turn-including-waiting-and-tools', source: 'task_complete.duration_ms', estimated: false, live: false,
  } : null;
  return combined;
}
const runtimeUsage = value => {
  if (!value || typeof value !== 'object') return null;
  const fields = { input_tokens: 'inputTokens', cached_input_tokens: 'cachedInputTokens', cache_write_input_tokens: 'cacheWriteInputTokens', output_tokens: 'outputTokens', reasoning_output_tokens: 'reasoningOutputTokens', total_tokens: 'totalTokens' };
  return Object.fromEntries(Object.entries(fields).map(([out, source]) => [out, Number.isSafeInteger(value[source]) && value[source] >= 0 ? value[source] : null]));
};

export function createRuntimeModel({ now = Date.now, maxThreads = 32 } = {}) {
  const threads = new Map();
  let active = { status: 'identity-unresolved', threadId: null, hostId: null };
  function getState(identity) {
    const key = keyFor(identity);
    if (!threads.has(key)) {
      if (threads.size >= maxThreads) {
        const victim = [...threads.keys()].find(candidate => candidate !== keyFor(active));
        if (victim) threads.delete(victim);
      }
      threads.set(key, { accumulator: createMetricsAccumulator({ threadId: identity.threadId }), visibleDeltaEvents: 0, visibleCharacters: 0, usageUpdates: 0, logSnapshot: null });
    }
    return threads.get(key);
  }
  function setIdentity(identity) {
    active = identity?.status === 'resolved' && isCoreThreadId(identity.threadId) && typeof identity.hostId === 'string' && identity.hostId
      ? { ...identity } : { status: identity?.status ?? 'identity-unresolved', threadId: null, hostId: null };
  }
  function consume(message) {
    if (message?.type !== 'mcp-notification') return;
    const p = message.params;
    if (!p || !isCoreThreadId(p.threadId) || typeof message.hostId !== 'string' || !message.hostId) return;
    const state = getState({ threadId: p.threadId, hostId: message.hostId });
    const timestamp = new Date(now()).toISOString();
    if (message.method === 'thread/tokenUsage/updated') {
      state.usageUpdates++;
      state.accumulator.consume({ type: 'token_usage_record', timestamp, payload: {
        thread_id: p.threadId, turn_id: p.turnId, thread_token_usage: runtimeUsage(p.tokenUsage?.total), usage: runtimeUsage(p.tokenUsage?.last),
      } });
    } else if (message.method === 'turn/started' && typeof p.turn?.id === 'string') {
      state.accumulator.consume({ type: 'event_msg', timestamp, payload: { type: 'task_started', thread_id: p.threadId, turn_id: p.turn.id, started_at: timestamp } });
    } else if (message.method === 'turn/completed' && typeof p.turn?.id === 'string') {
      state.accumulator.consume({ type: 'event_msg', timestamp, payload: { type: 'task_complete', thread_id: p.threadId, turn_id: p.turn.id, completed_at: timestamp } });
    } else if (message.method === 'item/agentMessage/delta' && typeof p.delta === 'string') {
      state.visibleDeltaEvents++;
      state.visibleCharacters += p.delta.length;
    }
  }
  function setLogSnapshot(identity, snapshot) {
    if (identity?.status !== 'resolved' || !isCoreThreadId(identity.threadId) || snapshot?.threadId !== identity.threadId || typeof identity.hostId !== 'string') return false;
    getState(identity).logSnapshot = structuredClone(snapshot);
    return true;
  }
  function snapshot() {
    if (active.status !== 'resolved') return {
      scopeKey: 'scope.waiting', noteKey: 'note.identityUnresolved', noteParams: { status: active.status },
      scopeLabel: 'Waiting for current conversation', scopeNote: `Conversation identity is not available (${active.status}).`, identity: { ...active },
      threadId: null, total: null, cacheHitRate: null, speed: null,
    };
    const state = getState(active);
    const live = state.accumulator.snapshot();
    const offline = state.logSnapshot;
    const nowMs = now();
    const combined = mergeSnapshots(live, offline, nowMs);
    const observedCost = offline?.cost ?? live.cost;
    combined.cost = observedCost ? {
      ...observedCost, total: reconcileCostSummary(observedCost.total, combined.total),
      currentTurn: observedCost.currentTurn?.turnId === combined.currentTurn?.id ? reconcileCostSummary(observedCost.currentTurn, combined.currentTurn?.usage) : null,
      lastTurn: observedCost.lastTurn?.turnId === combined.lastTurn?.id ? reconcileCostSummary(observedCost.lastTurn, combined.lastTurn?.usage) : null,
    } : null;
    const turnRate = estimateTurnRate(combined, nowMs);
    const ratePending = combined.currentTurn != null && !turnRate;
    return {
      ...combined, identity: { ...active }, threadId: active.threadId, hostId: active.hostId,
      scopeKey: 'scope.current', noteKey: turnRate ? turnRate.status === 'sampled' ? 'note.sampled' : 'note.completed'
        : ratePending ? 'note.waitingSample' : live.total || offline?.total ? 'note.usageWaitingTiming' : 'note.waitingUsage',
      scopeLabel: 'Current conversation', speed: null, turnRate, ratePending,
      scopeNote: turnRate
        ? turnRate.status === 'sampled'
          ? 'Sample avg is estimated: official turn output tokens (including reasoning) divided by turn time up to the same usage sample, including waiting and tools. The value holds until usage changes; sample age is shown below. Completion uses the final turn duration. Generation speed is unverified.'
          : 'Turn avg is estimated: official turn output tokens (including reasoning) divided by the final turn duration, including waiting and tools. This completed average does not change with the clock. Generation speed is unverified.'
        : ratePending ? 'Waiting for a complete usage sample and matching timing for this turn. Compaction or the first response can delay this sample.'
        : live.total || offline?.total
        ? 'Usage follows the verified conversation identity. Generation speed is awaiting verified token timing. Runtime-only turn totals may cover observed responses only.'
        : 'Conversation identified. Waiting for an official usage update or a matching local rollout.',
      runtimeDiagnostics: { usageUpdates: state.usageUpdates, visibleDeltaEvents: state.visibleDeltaEvents, visibleCharacters: state.visibleCharacters },
    };
  }
  return { setIdentity, consume, setLogSnapshot, snapshot, dispose: () => threads.clear() };
}
