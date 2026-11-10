import fs from 'node:fs';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { profile } from './verify-client.mjs';
import { VERSION } from '../src/version.mjs';

const output = new URL('../dist/statusbar.bundle.js', import.meta.url);
const packageInfo = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (packageInfo.version !== VERSION) throw new Error('源码版本与 package.json 不一致。');
const sourceRoot = new URL('../src/', import.meta.url);
const sourceHash = crypto.createHash('sha256');
for (const name of fs.readdirSync(sourceRoot).sort()) {
  if (!/\.(m?js|json)$/.test(name)) continue;
  sourceHash.update(name).update(fs.readFileSync(new URL(name, sourceRoot)));
}
const buildId = sourceHash.digest('hex');
await build({
  entryPoints: [fileURLToPath(new URL('../src/browser-entry.mjs', import.meta.url))],
  outfile: fileURLToPath(output), bundle: true, format: 'iife', platform: 'browser',
  target: 'chrome120', sourcemap: 'external', legalComments: 'none',
  define: { __STATUSBAR_BUILD_ID__: JSON.stringify(buildId) },
});
const manifest = {
  version: VERSION, buildId, clientAppVersion: profile.appVersion,
  clientAsarSha256: profile.asarSha256, entry: profile.entry,
  bundleSha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
};
fs.writeFileSync(new URL('../dist/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ built: 'dist/statusbar.bundle.js', bytes: fs.statSync(output).size, ...manifest }, null, 2));
