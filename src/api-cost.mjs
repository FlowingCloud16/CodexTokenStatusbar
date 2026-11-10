import catalog from './api-prices.json' with { type: 'json' };

export const PRICE_CATALOG = catalog;
export const COST_USAGE_FIELDS = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens'];
const valid = value => Number.isSafeInteger(value) && value >= 0;
const tierNames = { standard: 'standard', default: 'standard', fast: 'fast', priority: 'fast', flex: 'flex', batch: 'batch', ultrafast: 'ultrafast' };
const amount = (min, max = min) => ({ minPicoUsd: min.toString(), maxPicoUsd: max.toString() });
// 单价以百万 token 的美元数给出；换算为每 token 的 10^-12 美元整数。
export function rateUnits(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function priceResponse({ model, provider, serviceTier, usage } = {}) {
  const fail = reason => ({ amount: null, reason, model: typeof model === 'string' ? model : null });
  if (provider !== 'openai') return fail(provider ? 'custom-provider' : 'provider-unknown');
  const id = Object.hasOwn(catalog.aliases, model ?? '') ? catalog.aliases[model] : model;
  const item = Object.hasOwn(catalog.models, id ?? '') ? catalog.models[id] : null;
  if (!item) return fail(model ? 'model-unpriced' : 'model-unknown');
  if (!usage || COST_USAGE_FIELDS.some(key => !valid(usage[key]))) return fail('usage-incomplete');
  const { input_tokens: input, cached_input_tokens: read, cache_write_input_tokens: write, output_tokens: output } = usage;
  if (BigInt(read) + BigInt(write) > BigInt(input)
    || (usage.reasoning_output_tokens != null && (!valid(usage.reasoning_output_tokens) || usage.reasoning_output_tokens > output))
    || (usage.total_tokens != null && (!valid(usage.total_tokens) || BigInt(usage.total_tokens) !== BigInt(input) + BigInt(output)))) return fail('usage-invalid');
  const assumedTier = serviceTier == null || serviceTier === 'auto';
  const tier = assumedTier ? 'standard' : Object.hasOwn(tierNames, serviceTier) ? tierNames[serviceTier] : null;
  const schedule = tier ? item.tiers[tier] : null;
  if (!schedule) return fail('tier-unpriced');
  const long = schedule.contextThreshold != null && input > schedule.contextThreshold;
  const rates = long ? schedule.long : schedule.short;
  if (!rates?.input || !rates?.output) return fail('context-unpriced');
  const charge = (tokens, rate) => tokens === 0 ? 0n : rateUnits(rate) == null ? null : BigInt(tokens) * rateUnits(rate);
  const inputCost = charge(input - read - write, rates.input), readCost = charge(read, rates.cachedInput), outputCost = charge(output, rates.output);
  if ([inputCost, readCost, outputCost].includes(null)) return fail('component-unpriced');
  let writeMin = 0n, writeMax = 0n, writeAssumed = false;
  if (write > 0) {
    const details = usage.cache_write_input_tokens_details ?? usage.input_tokens_details?.cache_write_tokens_details;
    if (details != null) {
      const a = details.ttl_30m_tokens, b = details.ttl_12h_tokens;
      if (!valid(a) || !valid(b) || BigInt(a) + BigInt(b) !== BigInt(write)) return fail('write-details-invalid');
      const x = charge(a, rates.cacheWrite30m), y = charge(b, rates.cacheWrite12h);
      if (x == null || y == null) return fail('component-unpriced');
      writeMin = writeMax = x + y;
    } else {
      const x = charge(write, rates.cacheWrite30m), y = charge(write, rates.cacheWrite12h);
      if (x == null || y == null) return fail('component-unpriced');
      writeMin = x < y ? x : y; writeMax = x > y ? x : y; writeAssumed = true;
    }
  }
  const ordinary = inputCost + readCost + outputCost;
  return {
    amount: amount(ordinary + writeMin, ordinary + writeMax),
    components: { input: amount(inputCost), cacheRead: amount(readCost), cacheWrite: amount(writeMin, writeMax), output: amount(outputCost) },
    model: id, provider, tier, context: long ? 'long' : schedule.contextThreshold == null ? 'flat' : 'short', rates,
    assumptions: [...(assumedTier ? ['tier-standard-assumed'] : []), ...(writeAssumed ? ['write-ttl-unknown'] : [])],
  };
}

function sums(entries) {
  return Object.fromEntries(COST_USAGE_FIELDS.map(key => [key, entries.every(e => valid(e.usage?.[key]))
    ? entries.reduce((sum, e) => sum + BigInt(e.usage[key]), 0n).toString() : null]));
}
export function summarizeCosts(entries, expectedUsage, extraReasons = []) {
  const observed = sums(entries), reasons = new Map(extraReasons.map(key => [key, 1]));
  const addReason = key => reasons.set(key, (reasons.get(key) ?? 0) + 1);
  const components = Object.fromEntries(['input', 'cacheRead', 'cacheWrite', 'output'].map(key => [key, { min: 0n, max: 0n }]));
  let min = 0n, max = 0n, priced = 0;
  const models = new Map(), assumptions = new Set();
  for (const entry of entries) {
    const result = entry.forcedReason ? { reason: entry.forcedReason } : priceResponse(entry);
    if (!result.amount) { addReason(result.reason); continue; }
    priced++; min += BigInt(result.amount.minPicoUsd); max += BigInt(result.amount.maxPicoUsd);
    for (const [key, value] of Object.entries(result.components)) { components[key].min += BigInt(value.minPicoUsd); components[key].max += BigInt(value.maxPicoUsd); }
    for (const key of result.assumptions) assumptions.add(key);
    const groupKey = JSON.stringify([result.model, result.tier, result.context]);
    if (!models.has(groupKey)) models.set(groupKey, { model: result.model, tier: result.tier, context: result.context, rates: result.rates, responses: 0, min: 0n, max: 0n });
    const group = models.get(groupKey); group.responses++; group.min += BigInt(result.amount.minPicoUsd); group.max += BigInt(result.amount.maxPicoUsd);
  }
  const matched = entries.length > 0 && COST_USAGE_FIELDS.every(key => valid(expectedUsage?.[key]) && observed[key] === String(expectedUsage[key]));
  if (!matched) addReason(expectedUsage ? 'history-incomplete' : 'total-unverified');
  return {
    amount: priced ? amount(min, max) : null, pricedResponses: priced, unpricedResponses: entries.length - priced, responseCount: entries.length,
    complete: matched && priced === entries.length && extraReasons.length === 0,
    components: priced ? Object.fromEntries(Object.entries(components).map(([key, value]) => [key, amount(value.min, value.max)])) : null,
    models: [...models.values()].map(({ min: a, max: b, ...group }) => ({ ...group, amount: amount(a, b) })),
    assumptions: [...assumptions], reasons: [...reasons].map(([key, count]) => ({ key, count })),
    coverage: { matched, observedUsage: observed, expectedUsage: expectedUsage ?? null },
  };
}

// 运行时总量先于磁盘日志到达时只保留已定价小计，不能继续声称覆盖完整。
export function reconcileCostSummary(summary, expectedUsage) {
  if (!summary) return null;
  const matched = summary.responseCount > 0 && COST_USAGE_FIELDS.every(key => valid(expectedUsage?.[key]) && summary.coverage?.observedUsage?.[key] === String(expectedUsage[key]));
  if (matched) return summary;
  return { ...summary, complete: false,
    reasons: [...summary.reasons.filter(r => r.key !== 'runtime-gap'), { key: 'runtime-gap', count: 1 }],
    coverage: { ...summary.coverage, matched: false, expectedUsage: expectedUsage ?? null } };
}
