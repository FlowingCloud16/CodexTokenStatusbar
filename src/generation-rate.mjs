// 参照 dongyue-19/codex-statusbar 的 TpsTracker；许可见 desktop/licenses/codex-statusbar-MIT。
export const GENERATION_ALPHA = 0.35;
const isCount = value => Number.isSafeInteger(value) && value >= 0;

export function createGenerationRate(turnId) {
  let complete = false, intervals = [], output = 0, durationMs = 0;
  let value = null, rawValue = null, lastOutput = -1, lastDuration = -1;
  let sampledAtMs = null, sampleCount = 0, held = false;
  function begin() {
    if (complete) return;
    complete = true; intervals = []; output = 0; durationMs = 0;
    value = rawValue = sampledAtMs = null; lastOutput = lastDuration = -1;
    sampleCount = 0; held = false;
  }
  function invalidate() {
    complete = false; intervals = []; output = durationMs = 0;
    value = rawValue = sampledAtMs = null; lastOutput = lastDuration = -1;
    sampleCount = 0; held = false;
  }
  function refresh(at) {
    if (!complete || output <= 0 || durationMs <= 0 || (output === lastOutput && durationMs === lastDuration)) return;
    const sample = 1000 * output / durationMs;
    if (!Number.isFinite(sample) || sample <= 0 || sample > 100000) return;
    lastOutput = output; lastDuration = durationMs; rawValue = sample;
    value = value == null ? sample : GENERATION_ALPHA * sample + (1 - GENERATION_ALPHA) * value;
    sampledAtMs = isCount(at) ? at : intervals.at(-1)?.[1] ?? null;
    sampleCount++; held = false;
  }
  function observeItem(type, start, end, at) {
    if (!['reasoning', 'agentmessage'].includes(String(type).toLowerCase())) { held = true; return; }
    if (!isCount(start) || !isCount(end) || end <= start || end - start > 600000) return;
    const sorted = [...intervals, [start, end]].sort((a, b) => a[0] - b[0]);
    intervals = [];
    for (const window of sorted) {
      const previous = intervals.at(-1);
      if (previous && window[0] <= previous[1]) previous[1] = Math.max(previous[1], window[1]);
      else intervals.push([...window]);
    }
    durationMs = intervals.reduce((sum, [a, b]) => sum + b - a, 0);
    refresh(at);
  }
  function update(next, at) { if (isCount(next)) { output = next; refresh(at); } }
  function snapshot(status = 'running') {
    if (value == null) return null;
    return {
      value, rawValue, unit: 't/s', estimated: true, live: false, turnId,
      outputTokens: lastOutput, durationMs: lastDuration, sampledAtMs, sampleCount,
      smoothingAlpha: GENERATION_ALPHA, itemsComplete: complete,
      status: status === 'running' ? 'sampled' : status === 'aborted' ? 'aborted' : 'completed',
      held: status === 'running' && held,
      basis: 'official-output-including-reasoning/union-model-output-windows',
      source: 'codex-statusbar-model-output-window',
    };
  }
  return { begin, invalidate, observeItem, update, refresh, snapshot };
}
