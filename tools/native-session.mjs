import fs from 'node:fs';
import net from 'node:net';

export function readNativeDescriptor(filename) {
  const bytes = fs.readFileSync(filename);
  if (bytes.length > 4096) throw new Error('原生桥接描述文件过大。');
  const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.pid) || value.pid <= 0
      || !/^\\\\\.\\pipe\\codex-token-statusbar-native-[a-f0-9-]{36}$/.test(value.pipeName)
      || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error('原生桥接描述文件无效。');
  return value;
}

export function createNativeTransport(descriptor) {
  const request = body => new Promise((resolve, reject) => {
    const socket = net.createConnection(descriptor.pipeName);
    let length = 0, chunks = [], settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.setTimeout(6000, () => finish(new Error('原生桥接请求超时。')));
    socket.on('error', () => finish(new Error('原生桥接连接不可用。')));
    socket.on('connect', () => socket.write(JSON.stringify({ ...body, token: descriptor.token }) + '\n'));
    socket.on('data', chunk => {
      length += chunk.length;
      if (length > 1024 * 1024) { finish(new Error('原生桥接响应过大。')); return; }
      chunks.push(chunk);
      if (!chunk.includes(10)) return;
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        response.ok ? finish(null, response.value) : finish(new Error('原生桥接拒绝了请求。'));
      } catch { finish(new Error('原生桥接响应格式无效。')); }
    });
    socket.on('end', () => { if (!settled) finish(new Error('原生桥接提前关闭。')); });
  });
  return {
    request,
    discover: async () => request({ action: 'list' }),
    async connect(_endpoint, target) {
      let closed = false;
      return {
        evaluate(expression) {
          if (closed) return Promise.reject(new Error('原生页面连接已关闭。'));
          return request({ action: 'evaluate', targetId: target.id, expression });
        },
        close() { closed = true; },
      };
    },
  };
}
