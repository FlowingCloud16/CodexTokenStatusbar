import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';

// 只在发布维护时运行；加载器和页面不会访问网络更新价格。
const { values } = parseArgs({ options: { date: { type: 'string' } } });
if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date ?? '')) throw new Error('请用 --date 指定人工核对日期。');
const source = 'https://developers.openai.com/api/docs/pricing';
const response = await fetch(source + '.md', { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error('官方价格资料读取失败。');
const content = await response.text();
const start = content.indexOf('\nSpecialized models');
const end = content.indexOf('\nFine-tuning', start);
if (start < 0 || end < start || !content.includes('\nCyber models')) throw new Error('官方价格资料结构发生变化，需要重新核对。');
const sections = [content.slice(0, content.indexOf('\nCyber models')), content.slice(start, end)];
const models = {};
for (const section of sections) {
  let tier = null, header = [];
  for (const line of section.split('\n')) {
    const title = line.match(/^#{3,4} (Standard|Batch|Flex|Fast|Ultrafast)(?: pricing data)?$/);
    if (title || ['Standard', 'Fast'].includes(line.trim())) {
      tier = (title?.[1] ?? line.trim()).toLowerCase(); continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (cells.includes('Model')) { header = cells; continue; }
    if (!tier || cells.every(s => /^[-: ]*$/.test(s))) continue;
    if (header.includes('Category') && cells[0] !== 'Codex') continue;
    const id = cells[header.indexOf('Model')]?.replace(/ \(<272K context length\)$/, '');
    if (!/^gpt-[a-z0-9.\-]+$/.test(id ?? '')) continue;
    const decimal = value => /^\$\d+(?:\.\d{1,6})?$/.test(value ?? '') ? value.slice(1) : null;
    const rates = prefix => Object.fromEntries(Object.entries({
      input: 'input', output: 'output', cachedInput: 'cached input', cacheWrite30m: '30m write', cacheWrite12h: '12h write',
    }).map(([key, column]) => [key, decimal(cells[header.findIndex(h => h.toLowerCase() === (prefix + column).toLowerCase())])]));
    const contextual = header.includes('Short context input');
    const short = rates(contextual ? 'Short context ' : '');
    if (short.input == null || short.output == null) throw new Error('无法核对模型价格：' + id);
    models[id] ??= { tiers: {} };
    models[id].tiers[tier] = { contextThreshold: contextual ? 272000 : null, short, long: contextual ? rates('Long context ') : null };
  }
}
if (Object.keys(models).length < 20 || models['gpt-6.1-sol']?.tiers.standard.short.cachedInput !== '0.10'
  || !models['gpt-6.1-sol'].tiers.flex || !models['gpt-5.3-codex']) throw new Error('核心型号和档位核验未通过。');
const catalog = {
  version: values.date, verifiedOn: values.date, currency: 'USD', unitTokens: 1000000, source,
  sourceSha256: crypto.createHash('sha256').update(content).digest('hex'),
  cacheSource: 'https://developers.openai.com/api/docs/guides/prompt-caching',
  basis: 'current-published-api-token-prices', aliases: {},
  models: Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b))),
};
fs.writeFileSync(new URL('../src/api-prices.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ models: Object.keys(models).length, date: values.date, tiers: Object.keys(models['gpt-6.1-sol'].tiers), sourceSha256: catalog.sourceSha256 }, null, 2));
