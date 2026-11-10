"""只读记录当前 Codex 原生运行时的导出能力，不加载目标 DLL。"""
import argparse
import hashlib
import json
from pathlib import Path

import pefile


parser = argparse.ArgumentParser(description="检查 Codex 主进程原生接入能力")
parser.add_argument("app_directory")
parser.add_argument("output")
arguments = parser.parse_args()
app_root = Path(arguments.app_directory).resolve()
required = {
    "tryGetCurrent": "?TryGetCurrent@Isolate@v8@@SAPEAV12@XZ",
    "getCurrentContext": "?GetCurrentContext@Isolate@v8@@QEAA?AV?$Local@VContext@v8@@@2@XZ",
    "getEnvironment": "?GetCurrentEnvironment@node@@YAPEAVEnvironment@1@V?$Local@VContext@v8@@@v8@@@Z",
    "getMainContext": "?GetMainContext@node@@YA?AV?$Local@VContext@v8@@@v8@@PEAVEnvironment@1@@Z",
    "compile": "?Compile@Script@v8@@SA?AV?$MaybeLocal@VScript@v8@@@2@V?$Local@VContext@v8@@@2@V?$Local@VString@v8@@@2@PEAVScriptOrigin@2@@Z",
    "run": "?Run@Script@v8@@QEAA?AV?$MaybeLocal@VValue@v8@@@2@V?$Local@VContext@v8@@@2@@Z",
}
modules = []
for name in ("ChatGPT.exe", "chrome.dll"):
    filename = app_root / name
    with pefile.PE(str(filename), fast_load=True) as binary:
        binary.parse_data_directories(directories=[0])
        exports = {entry.name.decode(): entry.address
                   for entry in getattr(getattr(binary, "DIRECTORY_ENTRY_EXPORT", None), "symbols", [])
                   if entry.name}
        modules.append({"file": name, "bytes": filename.stat().st_size,
                        "sha256": hashlib.file_digest(filename.open("rb"), "sha256").hexdigest(),
                        "machine": hex(binary.FILE_HEADER.Machine), "exportCount": len(exports),
                        "bindings": {key: {"symbol": symbol, "present": symbol in exports}
                                     for key, symbol in required.items()}})
result = {"source": "本机 PE 文件静态导出清单，非 REA 反编译结果", "modules": modules,
          "limitation": "导出存在不证明能够执行；运行结果分别记录在主线程、脚本和完整状态栏验证报告中。"}
Path(arguments.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"modules": len(modules), "runtimeBindingsPresent": all(
    binding["present"] for binding in modules[1]["bindings"].values())}))
