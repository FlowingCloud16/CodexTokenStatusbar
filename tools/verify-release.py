import hashlib
import json
import os
from pathlib import Path
import re
import sys


def verify_release(tag=None):
    root = Path(__file__).resolve().parent.parent
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    if tag is None:
        tag = "v" + package["version"]
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag):
        raise ValueError("版本标签必须采用 v主版本.次版本.修订号 格式。")
    if tag != "v" + package["version"]:
        raise ValueError("版本标签与 package.json 不一致。")

    filename = "CodexTokenStatusbar-" + package["version"] + ".exe"
    asset = Path("release") / filename
    notes = Path("docs") / "releases" / (tag + ".md")
    content = (root / notes).read_text(encoding="utf-8")
    expected = re.findall(
        r"^([0-9a-f]{64})  " + re.escape(filename) + r"\s*$", content, re.MULTILINE
    )
    if len(expected) != 1:
        raise ValueError("发布说明必须包含唯一的 EXE SHA-256。")

    data = (root / asset).read_bytes()
    if not data.startswith(b"MZ"):
        raise ValueError("发布成品不是有效的 Windows 可执行文件。")
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected[0]:
        raise ValueError("EXE 摘要与发布说明不一致。")

    return {
        "tag": tag,
        "asset": asset.as_posix(),
        "notes": notes.as_posix(),
        "bytes": len(data),
        "sha256": digest,
    }


if __name__ == "__main__":
    if len(sys.argv) > 2:
        raise SystemExit("用法：python tools/verify-release.py [v0.6.1]")
    result = verify_release(sys.argv[1] if len(sys.argv) == 2 else None)
    # 仅写入 GitHub 提供的步骤输出文件，不读取或输出认证令牌。
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as stream:
            stream.write("tag=" + result["tag"] + "\n")
            stream.write("asset=" + result["asset"] + "\n")
            stream.write("notes=" + result["notes"] + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
