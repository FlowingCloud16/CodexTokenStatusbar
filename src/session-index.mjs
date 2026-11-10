import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RolloutReader } from './rollout-reader.mjs';
import { isCoreThreadId } from './thread-identity.mjs';

// Windows 索引可能保存带 \\?\ 前缀的路径，归属比较前统一规范化两端。
const canonicalPath = value => path.toNamespacedPath(fs.realpathSync(value));

export class SessionIndex {
  constructor(codexDirectory) {
    this.root = canonicalPath(codexDirectory);
    this.sessionsRoot = canonicalPath(path.join(this.root, 'sessions'));
    this.db = new DatabaseSync(path.join(this.root, 'state_5.sqlite'), { readOnly: true });
    this.lookup = this.db.prepare('SELECT rollout_path FROM threads WHERE id = ? LIMIT 1');
    this.readers = new Map();
  }
  read(identity) {
    // 当前只读取已经确认属于本机主机的对话，远程主机由其运行时通知提供用量。
    if (identity?.status !== 'resolved' || identity.hostId !== 'local' || !isCoreThreadId(identity.threadId)) return null;
    const record = this.lookup.get(identity.threadId);
    if (!record?.rollout_path) return null;
    const filename = canonicalPath(record.rollout_path);
    const relative = path.relative(this.sessionsRoot, filename);
    if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative) || !filename.endsWith('.jsonl')) return null;
    let reader = this.readers.get(filename);
    {
      const fd = fs.openSync(filename, 'r');
      let meta;
      try {
        const buffer = Buffer.alloc(65536);
        const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
        const end = buffer.indexOf(10);
        if (end < 0 || end >= count) return null;
        meta = JSON.parse(buffer.subarray(0, end).toString('utf8'));
      } catch { return null; } finally { fs.closeSync(fd); }
      if (meta.type !== 'session_meta' || meta.payload?.id !== identity.threadId) return null;
    }
    if (!reader) {
      reader = new RolloutReader(filename, { threadId: identity.threadId });
      if (this.readers.size >= 8) this.readers.delete(this.readers.keys().next().value);
      this.readers.set(filename, reader);
    }
    return reader.read();
  }
  close() { this.readers.clear(); this.db.close(); }
}
