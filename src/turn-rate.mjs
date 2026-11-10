// 整轮平均速率包含等待和工具耗时，不能当作模型生成速度。
export function estimateTurnRate(snapshot, nowMs = Date.now()) {
  const running = snapshot?.currentTurn != null;
  const turn = snapshot?.currentTurn ?? snapshot?.lastTurn;
  const outputTokens = turn?.usage?.output_tokens;
  if (turn?.coverage !== 'complete' || !Number.isSafeInteger(outputTokens) || outputTokens < 0) return null;
  let durationMs;
  let elapsedMs = null;
  let sampledAtMs = null;
  if (running) {
    if (!Number.isFinite(nowMs) || !Number.isFinite(turn.startedAtMs) || turn.startedAtMs < 0) return null;
    sampledAtMs = turn.usageUpdatedAtMs;
    if (!Number.isFinite(sampledAtMs) || sampledAtMs > nowMs) return null;
    // 输出计数与分母必须截止于同一条用量采样，轮询本身不能让速率持续下降。
    durationMs = sampledAtMs - turn.startedAtMs;
    elapsedMs = nowMs - turn.startedAtMs;
  } else {
    durationMs = turn.durationMs > 0 ? turn.durationMs :
      Number.isFinite(turn.completedAtMs) && Number.isFinite(turn.startedAtMs) ? turn.completedAtMs - turn.startedAtMs : null;
  }
  if (!Number.isFinite(durationMs) || !(durationMs > 0)) return null;
  return {
    value: outputTokens / (durationMs / 1000), unit: 't/s', estimated: true, live: false,
    turnId: turn.id, outputTokens, durationMs,
    status: running ? 'sampled' : 'completed', elapsedMs, sampledAtMs,
    sampleAgeMs: running ? nowMs - sampledAtMs : null,
    basis: 'turn-output-including-reasoning/elapsed-including-waiting-and-tools',
    source: running ? 'official-turn-output-and-matching-sample-time' : 'official-turn-output-and-completed-duration',
  };
}
