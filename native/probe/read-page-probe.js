const result = globalThis.__codexStatusbarNativePageProbe ?? null;
if (result?.phase === 'done' || result?.phase === 'error') delete globalThis.__codexStatusbarNativePageProbe;
return result;
