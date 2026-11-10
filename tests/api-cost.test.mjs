import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICE_CATALOG, priceResponse, rateUnits, summarizeCosts } from '../src/api-cost.mjs';
import { createMetricsAccumulator } from '../src/metrics.mjs';
import { createRuntimeModel } from '../src/runtime-model.mjs';

const usage = (input = 100000, cached = 80000, write = 10000, output = 2000) => ({
  input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: write,
  output_tokens: output, reasoning_output_tokens: 800, total_tokens: input + output,
});
const entry = (rest = {}) => ({ model: 'gpt-6.1-sol', provider: 'openai', usage: usage(), ...rest });
const meta = { type: 'session_meta', payload: { id: 'thread', model_provider: 'openai' } };
const context = (turnId = 't1', model = 'gpt-6.1-sol', serviceTier) => ({ type: 'turn_context', payload: { turn_id: turnId, model, service_tier: serviceTier } });
const record = (id, value, total = value, turn = 't1') => ({ type: 'token_usage_record', payload: { thread_id: 'thread', response_id: id, turn_id: turn, usage: value, thread_token_usage: total, turn_token_usage: total } });
const cost = acc => acc.snapshot().cost;
const full = () => { const acc = createMetricsAccumulator({ threadId: 'thread' }); acc.consume(meta); acc.consume(context()); return acc; };

test('价格目录包含主要现行和历史 GPT/Codex 文本模型，档位保持独立', () => {
  assert.equal(Object.keys(PRICE_CATALOG.models).length, 26);
  assert.deepEqual(Object.keys(PRICE_CATALOG.models['gpt-6.1-sol'].tiers), ['standard', 'batch', 'flex', 'fast', 'ultrafast']);
  assert.equal(PRICE_CATALOG.models['gpt-5.3-codex'].tiers.standard.short.output, '14.00');
  assert.equal(PRICE_CATALOG.models['gpt-6-sol'].tiers.standard.short.cachedInput, '0.20');
});
test('缓存读取、写入和推理不重复计算，写入期限缺失返回上下限', () => {
  const result = priceResponse(entry());
  assert.deepEqual(result.amount, { minPicoUsd: '73000000000', maxPicoUsd: '98000000000' });
  assert.deepEqual(result.assumptions, ['tier-standard-assumed', 'write-ttl-unknown']);
  assert.equal(result.components.input.minPicoUsd, '20000000000');
});
test('明确的混合写入 TTL 按各自数量计费，写入拆分总量必须一致', () => {
  const value = usage();
  value.cache_write_input_tokens_details = { ttl_30m_tokens: 6000, ttl_12h_tokens: 4000 };
  assert.equal(priceResponse(entry({ usage: value })).amount.minPicoUsd, '83000000000');
  value.cache_write_input_tokens_details.ttl_12h_tokens = 3000;
  assert.equal(priceResponse(entry({ usage: value })).reason, 'write-details-invalid');
});
test('零写入不要求 TTL，缓存与写入缺失、负数、拆分越界均不伪造费用', () => {
  assert.equal(priceResponse(entry({ usage: usage(100000, 80000, 0) })).amount.minPicoUsd, '68000000000');
  for (const value of [
    { ...usage(), cache_write_input_tokens: undefined },
    { ...usage(), cached_input_tokens: undefined }, usage(100000, 90001, 10000), usage(100000, -1, 0),
    { ...usage(), total_tokens: 1 }, { ...usage(), reasoning_output_tokens: 3000 },
  ]) assert.equal(priceResponse(entry({ usage: value })).amount, null);
});
test('Standard、Fast、Flex 和 Ultrafast 使用各自公开报价，未知档位不回退', () => {
  const value = usage(100000, 80000, 0);
  for (const [tier, expected] of [['standard','68000000000'], ['priority','136000000000'], ['fast','136000000000'], ['flex','34000000000'], ['batch','34000000000'], ['ultrafast','408000000000']])
    assert.equal(priceResponse(entry({ usage: value, serviceTier: tier })).amount.minPicoUsd, expected);
  assert.equal(priceResponse(entry({ serviceTier: 'private' })).reason, 'tier-unpriced');
});
test('长上下文按每个请求输入量判断，阈值边界不套用到对话累计', () => {
  assert.equal(priceResponse(entry({ usage: usage(272000, 0, 0) })).context, 'short');
  const result = priceResponse(entry({ usage: usage(272001, 0, 0) }));
  assert.equal(result.context, 'long'); assert.equal(result.rates.output, '15.00');
  const rows = Array.from({ length: 10 }, () => entry({ usage: usage(100000, 80000, 0) }));
  const sum = summarizeCosts(rows, usage(1000000, 800000, 0, 20000));
  assert.equal(sum.amount.minPicoUsd, '680000000000'); assert.equal(sum.models[0].context, 'short');
});
test('未知模型、未验证别名、自定义提供商和缺失提供商不会套用相似型号', () => {
  assert.equal(priceResponse(entry({ model: 'gpt-6.1-sol-unknown' })).reason, 'model-unpriced');
  assert.equal(priceResponse(entry({ model: null })).reason, 'model-unknown');
  assert.equal(priceResponse(entry({ provider: 'custom' })).reason, 'custom-provider');
  assert.equal(priceResponse(entry({ provider: null })).reason, 'provider-unknown');
});
test('金额使用整数累计，极小单价与大量重复响应不发生浮点误差', () => {
  assert.equal(rateUnits('0.000001'), 1n); assert.equal(rateUnits('1.0000001'), null);
  const row = entry({ model: 'gpt-6-luna', usage: { input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, total_tokens: 1 } });
  const result = summarizeCosts(Array(10000).fill(row), { input_tokens: 10000, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0 });
  assert.equal(result.amount.minPicoUsd, '1000000000'); assert.equal(result.complete, true);
});
test('同一对话跨模型逐响应计价，后续切换模型不重算旧响应', () => {
  const acc = full(), value = usage(100000, 80000, 0);
  acc.consume(record('r1', value)); acc.consume(context('t2', 'gpt-6.1-terra'));
  acc.consume(record('r2', value, usage(200000, 160000, 0, 4000), 't2'));
  assert.equal(cost(acc).total.amount.minPicoUsd, '102000000000');
  assert.equal(cost(acc).total.complete, true); assert.equal(cost(acc).total.models.length, 2);
});
test('相同响应 ID 重读和修订采用替换，现代与旧载体不重复累计', () => {
  const acc = full(), value = usage(100000, 80000, 0);
  acc.consume(record('r1', value)); acc.consume(record('r1', value));
  acc.consume({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: value, last_token_usage: value } } });
  assert.equal(cost(acc).total.responseCount, 1);
  const corrected = usage(100000, 80000, 0, 3000); acc.consume(record('r1', corrected));
  assert.equal(cost(acc).total.amount.minPicoUsd, '78000000000');
  assert.equal(cost(acc).total.complete, true);
});
test('同轮模型上下文变化后重读旧响应仍保留旧定价依据', () => {
  const acc = full(), value = usage(100000, 80000, 0);
  acc.consume(record('r1', value)); acc.consume(context('t1', 'gpt-6-astra'));
  acc.consume(record('r1', value));
  assert.equal(cost(acc).total.amount.minPicoUsd, '68000000000');
});
test('完整累计与逐响应对账，缺少历史与未计价记录都保持部分覆盖', () => {
  const acc = full(), value = usage(100000, 80000, 0);
  acc.consume(record('r1', value, usage(200000, 160000, 0, 4000)));
  assert.equal(cost(acc).total.complete, false);
  assert.equal(cost(acc).total.coverage.matched, false);
  acc.consume(context('t2', 'unpriced')); acc.consume(record('r2', value, usage(200000, 160000, 0, 4000), 't2'));
  assert.equal(cost(acc).total.coverage.matched, true);
  assert.equal(cost(acc).total.complete, false); assert.equal(cost(acc).total.unpricedResponses, 1);
});
test('缺少模型上下文的早期响应不按后续模型猜测，未知费用不是零', () => {
  const acc = createMetricsAccumulator(); acc.consume(meta); acc.consume(record('r1', usage()));
  acc.consume(context());
  assert.equal(cost(acc).total.amount, null);
  assert.equal(cost(acc).total.unpricedResponses, 1);
});
test('轮次开始、完成和下一轮开始后分别保留正确费用', () => {
  const acc = full(); const value = usage(100000, 80000, 0);
  acc.consume({ type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } }); acc.consume(record('r1', value));
  acc.consume({ type: 'event_msg', payload: { type: 'task_complete', turn_id: 't1' } });
  acc.consume({ type: 'event_msg', payload: { type: 'task_started', turn_id: 't2' } });
  assert.equal(cost(acc).lastTurn.amount.minPicoUsd, '68000000000');
  assert.equal(cost(acc).currentTurn.amount, null);
});
test('累计重置后不把旧记录再次叠加，继承历史明确标为未核验', () => {
  const acc = full(); acc.consume(record('r1', usage()));
  acc.consume(record('r2', usage(1000, 0, 0), usage(1000, 0, 0), 't2'));
  assert.equal(cost(acc).total.responseCount, 1); assert.equal(cost(acc).total.complete, false);
  assert.ok(cost(acc).total.reasons.some(r => r.key === 'counter-reset'));
  const fork = full(); fork.consume({ ...meta, payload: { ...meta.payload, forked_from_id: 'parent' } }); fork.consume(record('r1', usage()));
  assert.equal(cost(fork).total.complete, false);
});
test('对话身份不匹配时费用也隔离，原样 JSON 不泄露完整日志', () => {
  const acc = full(); acc.consume({ ...record('r1', usage()), payload: { ...record('r1', usage()).payload, thread_id: 'foreign' } });
  assert.equal(cost(acc).total.responseCount, 0);
});
test('实时总量领先日志时保留日志小计并标记缺口，切换对话与主机不带走费用', () => {
  const A = '01a1ba45-994e-75f3-ac70-6be9853c67b9', B = '01a1ba45-994e-75f3-ac70-6be9853c67b8';
  const identity = { status: 'resolved', threadId: A, hostId: 'local' }, model = createRuntimeModel({ now: () => 3000 });
  const acc = full(); acc.consume(record('r1', usage(100000, 80000, 0)));
  model.setIdentity(identity); model.setLogSnapshot(identity, { ...acc.snapshot(), threadId: A, updatedAt: new Date(1000).toISOString() });
  assert.equal(model.snapshot().cost.total.complete, true);
  model.consume({ type: 'mcp-notification', method: 'thread/tokenUsage/updated', hostId: 'local', params: { threadId: A, turnId: B,
    tokenUsage: { total: { inputTokens: 200000, cachedInputTokens: 160000, cacheWriteInputTokens: 0, outputTokens: 4000, totalTokens: 204000 } } } });
  assert.equal(model.snapshot().cost.total.complete, false);
  assert.equal(model.snapshot().cost.total.amount.minPicoUsd, '68000000000');
  assert.ok(model.snapshot().cost.total.reasons.some(r => r.key === 'runtime-gap'));
  model.setIdentity({ ...identity, hostId: 'remote' }); assert.equal(model.snapshot().cost.total.amount, null);
});
