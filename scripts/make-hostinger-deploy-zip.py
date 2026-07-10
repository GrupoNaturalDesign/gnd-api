#!/usr/bin/env python3
"""Create deploy zip with prebuilt dist + build env for Hostinger platform."""
import json
import zipfile
from datetime import datetime
from pathlib import Path

API = Path(__file__).resolve().parent.parent
OUT = API.parent / f"gnd-api-deploy_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
SKIP_DIRS = {"node_modules", ".vercel", "uploads"}
SKIP_FILES = {".env", "hostinger.env", "serviceAccountKey.json"}
SKIP_PREFIXES = (".env.",)


def should_skip(rel: Path) -> bool:
    parts = rel.parts
    if parts and parts[0] in SKIP_DIRS:
        return True
    if parts and parts[0] == "uploads" and len(parts) > 1 and parts[1] == "temp":
        return True
    name = rel.name
    if name in SKIP_FILES:
        return True
    if any(name.startswith(p) for p in SKIP_PREFIXES):
        return True
    if rel.as_posix() == "package.json":
        return True
    return False


def build_env_content() -> str:
    lines = (API / "hostinger.env").read_text(encoding="utf-8").splitlines()
    skip_keys = {"NODE_ENV", "PORT"}
    out = []
    for line in lines:
        if not line.strip() or line.strip().startswith("#"):
            out.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in skip_keys:
            continue
        out.append(line)
    out.append("NODE_ENV=development")
    return "\n".join(out) + "\n"


def hostinger_package_json() -> str:
    data = json.loads((API / "package.json").read_text(encoding="utf-8"))
    data["scripts"]["build"] = "prisma generate"
    return json.dumps(data, indent=2) + "\n"


dist_index = API / "dist" / "index.js"
if not dist_index.exists():
    raise SystemExit("Run `npm run build` in api/ before creating deploy zip.")

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in API.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(API)
        if should_skip(rel):
            continue
        zf.write(path, rel.as_posix())
    zf.writestr("package.json", hostinger_package_json())
    zf.writestr(".env", build_env_content())

print(OUT)
print(OUT.stat().st_size)
