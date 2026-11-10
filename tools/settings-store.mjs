import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LAYOUTS = Object.freeze(['adaptive', 'separate', 'icon']);
export function createSettingsStore(filename) {
  let latest = { schemaVersion: 1, layout: 'adaptive' };
  return {
    read() {
      try {
        if (fs.statSync(filename).size > 4096) return { ...latest };
        const value = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
        if (LAYOUTS.includes(value?.layout)) latest = { schemaVersion: 1, layout: value.layout };
      } catch { /* 设置暂时不可读时保留最近一次有效值，不影响统计连接。 */ }
      return { ...latest };
    },
    save(layout) {
      if (!LAYOUTS.includes(layout)) throw new Error('不支持的状态栏布局。');
      const value = { schemaVersion: 1, layout };
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, filename);
        latest = value;
      } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      return { ...latest };
    },
  };
}
