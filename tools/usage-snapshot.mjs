import { parseArgs } from 'node:util';
import { RolloutReader } from '../src/rollout-reader.mjs';

const { values } = parseArgs({ options: {
  file: { type: 'string' }, thread: { type: 'string' }, watch: { type: 'boolean', default: false },
} });
if (!values.file) throw new Error('请用 --file 明确指定待检查的会话日志。');
const reader = new RolloutReader(values.file, { threadId: values.thread ?? null });
let last = '';
function update() {
  const state = JSON.stringify(reader.read());
  if (state !== last) { console.log(state); last = state; }
}
update();
if (values.watch) setInterval(update, 500);
