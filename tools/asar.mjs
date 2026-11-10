import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function openAsar(filename) {
  const fd = fs.openSync(filename, 'r');
  const prefix = Buffer.alloc(16);
  fs.readSync(fd, prefix, 0, prefix.length, 0);
  const header = Buffer.alloc(prefix.readUInt32LE(12));
  fs.readSync(fd, header, 0, header.length, 16);
  const root = JSON.parse(header);
  const dataOffset = 8 + prefix.readUInt32LE(4);
  function entry(name) {
    return name.split('/').reduce((parent, part) => parent?.files?.[part], root);
  }
  function read(name) {
    const item = entry(name);
    if (!item || item.files || item.unpacked || item.link) throw new Error(`无法读取归档成员：${name}`);
    const bytes = Buffer.alloc(item.size);
    const count = fs.readSync(fd, bytes, 0, bytes.length, dataOffset + Number(item.offset));
    if (count !== bytes.length) throw new Error(`归档成员读取不完整：${name}`);
    if (item.integrity?.algorithm === 'SHA256') {
      const actual = crypto.createHash('sha256').update(bytes).digest('hex');
      if (actual !== item.integrity.hash) throw new Error(`归档成员摘要不匹配：${name}`);
    }
    return bytes;
  }
  function list(directory = '') {
    const parent = directory ? entry(directory) : root;
    return Object.entries(parent?.files ?? {}).map(([name, item]) => ({
      path: directory ? `${directory}/${name}` : name, size: item.size ?? null,
      directory: Boolean(item.files), sha256: item.integrity?.hash ?? null,
    }));
  }
  return { read, list, close: () => fs.closeSync(fd) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [, , filename, directory = '', output] = process.argv;
  const archive = openAsar(filename);
  try {
    const entries = archive.list(directory);
    if (output) {
      const root = path.resolve(output);
      for (const item of entries.filter(item => !item.directory)) {
        const destination = path.resolve(root, item.path);
        if (!destination.startsWith(root + path.sep)) throw new Error('提取目标越出工作目录');
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, archive.read(item.path));
      }
    }
    console.log(JSON.stringify(entries, null, 2));
  } finally { archive.close(); }
}
