import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export async function launchHarnessBrowser() {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); } catch {
    const runtimeRoot = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'runtimes', 'cua_node');
    for (const name of fs.existsSync(runtimeRoot) ? fs.readdirSync(runtimeRoot) : []) {
      const packagePath = path.join(runtimeRoot, name, 'bin', 'node_modules', 'playwright');
      if (fs.existsSync(packagePath)) { playwright = require(packagePath); break; }
    }
  }
  if (!playwright) throw new Error('未找到 Playwright；可安装为本项目开发依赖后重试。');
  const executablePath = [
    playwright.chromium.executablePath(),
    path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].find(candidate => fs.existsSync(candidate));
  if (!executablePath) throw new Error('未找到已安装的 Chromium、Edge 或 Chrome。');
  return playwright.chromium.launch({ executablePath, headless: true });
}
