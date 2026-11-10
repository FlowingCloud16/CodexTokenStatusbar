import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.desktop-build');
fs.mkdirSync(output, { recursive: true });
const corpus = path.join(output, 'dotnet-fixtures.json');
const suite = path.join(output, 'dotnet-fixtures.mjs');
const casesPath = path.join(output, 'dotnet-cases.json');
const actualPath = path.join(output, 'dotnet-actual.json');
const suites = ['metrics', 'api-cost', 'rollout-reader', 'runtime-model', 'runtime-rate-merge', 'turn-rate'];
const contents = `import fs from 'node:fs';import crypto from 'node:crypto';
globalThis.__dotnetCases=new Map();
globalThis.__dotnetSave=(value)=>{const key=crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');globalThis.__dotnetCases.set(key,value);};
process.on('beforeExit',()=>fs.writeFileSync(${JSON.stringify(corpus)},JSON.stringify([...globalThis.__dotnetCases.values()])));
${suites.map(name => `await import(${JSON.stringify(path.join(root, 'tests', `${name}.test.mjs`))});`).join('\n')}`;
await build({ stdin: { contents, resolveDir: root, sourcefile: 'dotnet-fixtures-entry.mjs' }, outfile: suite, bundle: true, platform: 'node', format: 'esm', target: 'node24', plugins: [{ name: '收集原有实现的对照结果', setup(api) {
  api.onLoad({ filter: /[\\/]src[\\/](metrics|api-cost)\.mjs$/ }, async ({ path: filename }) => {
    let source = fs.readFileSync(filename, 'utf8');
    if (filename.endsWith('metrics.mjs')) {
      source = source.replace('export function createMetricsAccumulator(', 'function originalMetrics(');
      source += `\nexport function createMetricsAccumulator(options={}){const records=[];const inner=originalMetrics(options);return {consume(value){records.push(structuredClone(value));inner.consume(value);},snapshot(){const expected=inner.snapshot();globalThis.__dotnetSave({kind:'metrics',options,records:structuredClone(records),expected:structuredClone(expected)});return expected;}};}\n`;
    } else {
      for (const [name, parameters, call, capture] of [
        ['rateUnits', 'value', 'value', `{kind:'rate',value,expected:result==null?null:result.toString()}`],
        ['priceResponse', 'entry={}', 'entry', `{kind:'price',entry,expected:result}`],
        ['summarizeCosts', 'entries,expectedUsage,reasons=[]', 'entries,expectedUsage,reasons', `{kind:'summary',entries,expectedUsage:expectedUsage??null,reasons,expected:result}`],
      ]) {
        source = source.replace(`export function ${name}(`, `function original_${name}(`);
        source += `\nexport function ${name}(${parameters}){const result=original_${name}(${call});globalThis.__dotnetSave(structuredClone(${capture}));return result;}\n`;
      }
    }
    return { contents: source, loader: 'js' };
  });
} }] });
execFileSync(process.execPath, [suite], { cwd: root, stdio: 'inherit' });
const cases = JSON.parse(fs.readFileSync(corpus, 'utf8'));
// 额外核对增量文件读取，包括跨块 UTF-8、未完成尾行、截断与文件替换。
const { RolloutReader } = await import('../src/rollout-reader.mjs');
const id = '11111111-2222-3333-4444-555555555555';
const usage = n => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: n, reasoning_output_tokens: 0, total_tokens: n * 2 });
const record = n => JSON.stringify({ type: 'token_usage_record', timestamp: new Date(n * 1000).toISOString(), payload: { thread_id: id, turn_id: 't1', response_id: `r${n}`, usage: usage(n), thread_token_usage: usage(n) } });
const initial = Buffer.from(JSON.stringify({ type: 'session_meta', payload: { id, model_provider: 'openai' }, label: '中文测试' }) + '\n' + record(1));
const split = initial.indexOf(Buffer.from('中文')) + 1;
const actions = [{ bytes: initial.subarray(0, split) }, { bytes: initial.subarray(split) }, { bytes: Buffer.from('\n' + record(2) + '\n') }, { bytes: Buffer.from(record(1) + '\n'), truncate: true }, { bytes: Buffer.from(record(3) + '\n'), replace: true }];
const jsFile = path.join(output, 'dotnet-reader-js.jsonl'), csFile = path.join(output, 'dotnet-reader-cs.jsonl');
fs.writeFileSync(jsFile, ''); const reader = new RolloutReader(jsFile, { threadId: id }); const expected = [];
for (const action of actions) {
  if (action.replace) { fs.writeFileSync(jsFile + '.replacement', action.bytes); fs.renameSync(jsFile + '.replacement', jsFile); }
  else if (action.truncate) fs.writeFileSync(jsFile, action.bytes); else fs.appendFileSync(jsFile, action.bytes);
  expected.push(reader.read());
}
cases.push({ kind: 'reader', filename: csFile, threadId: id, actions: actions.map(a => ({ ...a, bytes: a.bytes.toString('base64') })), expected });
// 使用隔离的 SQLite 索引确认路径边界与线程元数据，覆盖正在使用 WAL 的数据库。
const { DatabaseSync } = await import('node:sqlite');
const { SessionIndex } = await import('../src/session-index.mjs');
const sessionRoot = path.join(output, 'dotnet-session-fixture'); fs.mkdirSync(path.join(sessionRoot, 'sessions'), { recursive: true });
const database = new DatabaseSync(path.join(sessionRoot, 'state_5.sqlite'));
database.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY,rollout_path TEXT); DELETE FROM threads;');
const sessionFile = path.join(sessionRoot, 'sessions', '会话.jsonl');
fs.writeFileSync(sessionFile, JSON.stringify({ type: 'session_meta', payload: { id, model_provider: 'openai' } }) + '\n' + record(1) + '\n');
database.prepare('INSERT INTO threads VALUES(?,?)').run(id, sessionFile);
const index = new SessionIndex(sessionRoot);
for (const identity of [{ status: 'resolved', threadId: id, hostId: 'local' }, { status: 'resolved', threadId: id, hostId: 'remote' }, { status: 'identity-unresolved', threadId: id, hostId: 'local' }]) cases.push({ kind: 'session', directory: sessionRoot, identity, expected: index.read(identity) });
const foreign = '11111111-2222-3333-4444-555555555556'; database.prepare('INSERT INTO threads VALUES(?,?)').run(foreign, sessionFile);
cases.push({ kind: 'session', directory: sessionRoot, identity: { status: 'resolved', threadId: foreign, hostId: 'local' }, expected: null });
const escaped = '11111111-2222-3333-4444-555555555557'; database.prepare('INSERT INTO threads VALUES(?,?)').run(escaped, jsFile);
cases.push({ kind: 'session', directory: sessionRoot, identity: { status: 'resolved', threadId: escaped, hostId: 'local' }, expected: null });
fs.writeFileSync(casesPath, JSON.stringify(cases));
const compiler = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const executable = path.join(output, 'Backend.Tests.exe');
execFileSync(compiler, ['/nologo', '/target:exe', '/platform:x64', '/optimize+', '/codepage:65001', `/out:${executable}`, '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Numerics.dll', '/reference:System.Web.Extensions.dll', ...['UsageBackend.cs', 'SessionReader.cs', 'Backend.Tests.cs'].map(file => path.join(root, 'desktop', file))], { stdio: 'inherit' });
try { execFileSync(executable, [casesPath, actualPath, path.join(root, 'src', 'api-prices.json')], { cwd: root, stdio: 'inherit' }); }
finally { index.close(); database.close(); }
const actual = JSON.parse(fs.readFileSync(actualPath, 'utf8')); assert.equal(actual.length, cases.length);
let mismatches = 0;
for (let i = 0; i < cases.length; i++) {
  try { assert.deepStrictEqual(actual[i], cases[i].expected); }
  catch (error) { console.error(`第 ${i} 项 ${cases[i].kind} 对照失败：${error.message}`); if (++mismatches >= 5) break; }
}
assert.equal(mismatches, 0, 'C# 与原有统计结果不一致');
const report = { passed: cases.length, kinds: Object.fromEntries([...new Set(cases.map(c => c.kind))].map(kind => [kind, cases.filter(c => c.kind === kind).length])), existingSuites: suites, sqlite: 'Windows 系统组件，隔离数据库与 WAL', externalNodeRequiredByRelease: false, scope: '统计与计费逐项对照；此工具仅在开发验证时使用 Node' };
fs.writeFileSync(path.join(root, 'reports', 'dotnet-backend-checks.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
