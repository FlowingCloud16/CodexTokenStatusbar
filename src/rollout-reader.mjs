import fs from 'node:fs';
import { createMetricsAccumulator } from './metrics.mjs';

// 只读增量读取；保留未完成的行，避免把写入中的半条记录判为坏数据。
export class RolloutReader {
  constructor(filename, { threadId = null, initialBytes = 4 * 1024 * 1024, maxInitialBytes = 64 * 1024 * 1024 } = {}) {
    this.filename = filename;
    this.options = { threadId };
    this.initialBytes = initialBytes;
    this.maxInitialBytes = maxInitialBytes;
    this.offset = 0;
    this.pending = Buffer.alloc(0);
    this.accumulator = createMetricsAccumulator(this.options);
    this.initialized = false;
    this.fileIdentity = null;
    this.bootstrapBytes = 0;
    this.startedFromTail = false;
  }

  consumeBytes(bytes) {
    const combined = this.pending.length ? Buffer.concat([this.pending, bytes]) : bytes;
    let start = 0;
    for (let end = combined.indexOf(10); end >= 0; end = combined.indexOf(10, start)) {
      if (end > start) this.accumulator.consume(combined.subarray(start, end).toString('utf8'));
      start = end + 1;
    }
    this.pending = Buffer.from(combined.subarray(start));
  }

  read() {
    const fd = fs.openSync(this.filename, 'r');
    try {
      const stat = fs.fstatSync(fd);
      const identity = `${stat.dev}:${stat.ino}`;
      if (!this.initialized || stat.size < this.offset || identity !== this.fileIdentity) {
        let size = Math.min(this.initialBytes, stat.size);
        do {
          const start = stat.size - size;
          const bytes = Buffer.alloc(size);
          const count = fs.readSync(fd, bytes, 0, size, start);
          const firstLine = start > 0 ? bytes.indexOf(10) + 1 : 0;
          this.accumulator = createMetricsAccumulator(this.options);
          this.pending = Buffer.alloc(0);
          this.consumeBytes(bytes.subarray(firstLine, count));
          this.startedFromTail = start > 0;
          this.bootstrapBytes = count;
          // 费用需要模型上下文与逐响应历史；找到最后一个累计值还不足以停止回读。
          if (size >= stat.size || size >= this.maxInitialBytes) break;
          size = Math.min(size * 2 || this.initialBytes, stat.size, this.maxInitialBytes);
        } while (true);
        this.offset = stat.size;
        this.initialized = true;
        this.fileIdentity = identity;
      } else {
        while (this.offset < stat.size) {
          const bytes = Buffer.alloc(Math.min(1024 * 1024, stat.size - this.offset));
          const count = fs.readSync(fd, bytes, 0, bytes.length, this.offset);
          if (!count) break;
          this.consumeBytes(bytes.subarray(0, count));
          this.offset += count;
        }
      }
      return {
        ...this.accumulator.snapshot(),
        reader: { startedFromTail: this.startedFromTail, bootstrapBytes: this.bootstrapBytes, bytesRead: this.offset },
      };
    } finally { fs.closeSync(fd); }
  }
}
