import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { listTargets, connectTarget } from './cdp-session.mjs';
import { VERSION } from '../src/version.mjs';

const { values } = parseArgs({ options: { endpoint: { type: 'string' }, target: { type: 'string' }, name: { type: 'string' } } });
if (values.name && !/^[a-z0-9-]{1,64}$/.test(values.name)) throw new Error('--name 只能使用小写字母、数字和连字符。');
const imageName = values.name ?? 'real-client-statusbar';
const stateName = values.name ?? 'runtime-chat-ui';
const target = (await listTargets(values.endpoint)).find(item => item.id === values.target);
if (!target) throw new Error('请明确选择已经列出的 Codex 页面。');
const session = await connectTarget(values.endpoint, target);
let openedForCapture = false;
try {
  const state = await session.evaluate(`(() => {
    const runtime = window.__codexTokenStatusbarRuntime;
    const host = document.getElementById('codex-token-statusbar');
    if (runtime?.version !== ${JSON.stringify(VERSION)} || !host) return null;
    const shadow = host.shadowRoot;
    const button = shadow.querySelector('button');
    const openedForCapture = button.getAttribute('aria-expanded') !== 'true';
    if (openedForCapture) button.click();
    const panel = shadow.querySelector('section');
    const anchor = host.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
    const x = Math.max(0, Math.floor(Math.min(anchor.x, bounds.x) - 4));
    const y = Math.max(0, Math.floor(Math.min(anchor.y, bounds.y) - 4));
    const right = Math.min(innerWidth, Math.ceil(Math.max(anchor.right, bounds.right) + 4));
    const bottom = Math.min(innerHeight, Math.ceil(Math.max(anchor.bottom, bounds.bottom) + 4));
    return {
      openedForCapture, inspect: runtime.inspect(), topLayer: panel.matches(':popover-open'),
      panelHit: document.elementFromPoint(bounds.left + 20, bounds.top + 20) === host,
      values: Object.fromEntries([...shadow.querySelectorAll('[data-value]')].map(element => [element.dataset.value, element.textContent])),
      headings: [...shadow.querySelectorAll('h3')].map(element => element.textContent),
      details: [...shadow.querySelectorAll('dl')].map(element => element.innerText),
      clip: { x, y, width: right - x, height: bottom - y, scale: 1 }
    };
  })()`);
  if (!state) throw new Error('页面没有已加载的本组件。');
  openedForCapture = state.openedForCapture;
  if (!(state.clip.width > 0 && state.clip.height > 0)) throw new Error('状态栏没有可截图的区域。');
  // 仅保存本组件文字和局部截图，避免读取对话正文。
  fs.writeFileSync(new URL(`../reports/${stateName}.json`, import.meta.url), JSON.stringify(state, null, 2));
  const png = await session.captureScreenshot(state.clip);
  fs.writeFileSync(new URL(`../reports/${imageName}.png`, import.meta.url), Buffer.from(png, 'base64'));
  console.log(JSON.stringify({ ...state, screenshot: `reports/${imageName}.png` }, null, 2));
} finally {
  if (openedForCapture) {
    try { await session.evaluate(`(() => {
      const button = document.getElementById('codex-token-statusbar')?.shadowRoot?.querySelector('button');
      if (button?.getAttribute('aria-expanded') === 'true') button.click();
    })()`); } catch { /* 页面关闭时无需恢复弹出框。 */ }
  }
  session.close();
}
