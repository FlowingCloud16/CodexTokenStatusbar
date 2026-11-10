import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createNativeTransport } from '../tools/native-session.mjs';

const { start } = createRequire(import.meta.url)('../native/main-bridge.cjs');

test('原生管道完成鉴权、页面选择、异步执行和卸载，全程不调用调试接口', async () => {
  const host = {};
  const descriptor = { pipeName: `\\\\.\\pipe\\codex-token-statusbar-native-${crypto.randomUUID()}`,
    token: crypto.randomBytes(32).toString('hex') };
  const calls = [];
  const makeWindow = (id, url) => ({ webContents: { id, getURL: () => url,
    executeJavaScript: async expression => { calls.push({ id, expression }); return { result: 42 }; },
    get debugger() { throw new Error('原生通道不得访问调试接口。'); },
  } });
  const electron = { BrowserWindow: { getAllWindows: () => [makeWindow(1, 'app://codex/index.html'),
    makeWindow(2, 'https://example.com/'), makeWindow(3, 'file:///fixture/index.html')] } };
  start({ ...descriptor, electron, host });
  const client = createNativeTransport(descriptor);
  try {
    const ping = await client.request({ action: 'ping' });
    assert.equal(ping.transport, 'native-pipe'); assert.equal(ping.debugging, false);
    await assert.rejects(createNativeTransport({ ...descriptor, token: '0'.repeat(64) }).request({ action: 'ping' }));
    const targets = await client.discover();
    assert.deepEqual(targets.map(target => target.id), ['1', '3']);
    const session = await client.connect(null, targets[0]);
    assert.deepEqual(await session.evaluate('6 * 7'), { result: 42 });
    assert.deepEqual(calls, [{ id: 1, expression: '6 * 7' }]);
    await assert.rejects(client.request({ action: 'evaluate', targetId: '2', expression: '6 * 7' }));
    await assert.rejects(client.request({ action: 'evaluate', targetId: '1', expression: 'x'.repeat(512 * 1024 + 1) }));
    assert.equal(calls.length, 1);
    session.close(); await assert.rejects(session.evaluate('6 * 7'));
    assert.throws(() => start({ ...descriptor, token: 'f'.repeat(64), electron, host }));
    await client.request({ action: 'close' });
    assert.equal(host.__codexTokenStatusbarNativeBridge, undefined);
  } finally { host.__codexTokenStatusbarNativeBridge?.stop(); }
});
