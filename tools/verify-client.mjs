import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { openAsar } from './asar.mjs';

export const profile = JSON.parse(fs.readFileSync(new URL('../client-profile.json', import.meta.url), 'utf8'));
export async function verifyClient(asarPath = profile.defaultAsarPath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(asarPath)) hash.update(chunk);
  const actualHash = hash.digest('hex');
  const mismatches = [];
  if (actualHash !== profile.asarSha256) mismatches.push('归档整体摘要不匹配');
  const archive = openAsar(asarPath);
  let appVersion;
  try {
    appVersion = JSON.parse(archive.read('package.json')).version;
    if (appVersion !== profile.appVersion) mismatches.push('应用版本不匹配');
    for (const member of profile.members) {
      const actual = crypto.createHash('sha256').update(archive.read(member.path)).digest('hex');
      if (actual !== member.sha256) mismatches.push(`成员摘要不匹配：${member.path}`);
    }
  } finally { archive.close(); }
  return { ok: mismatches.length === 0, appVersion, asarSha256: actualHash, checkedMembers: profile.members.length, mismatches };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({ options: { asar: { type: 'string' } } });
  const result = await verifyClient(values.asar);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
