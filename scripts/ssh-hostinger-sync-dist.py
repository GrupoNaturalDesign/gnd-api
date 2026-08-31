#!/usr/bin/env python3
"""
Sync local api/dist → Hostinger runtime nodejs/dist (push-to-deploy).

Uploads a single gzipped tar (fast/reliable) then swaps dist atomically.
Does NOT overwrite .env unless --with-env and hostinger.env exists.
Always enforces DB_HOST=127.0.0.1 on runtime .env (Hostinger IPv6 fix).

Env:
  HOSTINGER_SSH_PASSWORD (required)
  HOSTINGER_SSH_HOST (default 82.25.67.184)
  HOSTINGER_SSH_PORT (default 65002)
  HOSTINGER_SSH_USER (default u967550282)
"""
from __future__ import annotations

import os
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko

API = Path(__file__).resolve().parent.parent
DIST = API / "dist"
RUNTIME = os.environ.get(
    "HOSTINGER_RUNTIME",
    "/home/u967550282/domains/api.naturalonline.com.ar/nodejs",
)
HOST = os.environ.get("HOSTINGER_SSH_HOST") or "82.25.67.184"
PORT = int(os.environ.get("HOSTINGER_SSH_PORT") or "65002")
USER = os.environ.get("HOSTINGER_SSH_USER") or "u967550282"
PASSWORD = os.environ.get("HOSTINGER_SSH_PASSWORD") or ""
WITH_ENV = "--with-env" in sys.argv


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 180) -> tuple[int, str]:
    print(f">>> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    return code, out


def main() -> int:
    if not PASSWORD:
        print("HOSTINGER_SSH_PASSWORD required", file=sys.stderr)
        return 1
    if not (DIST / "index.js").exists():
        print("Run npm run build first (dist/index.js missing)", file=sys.stderr)
        return 1

    with tempfile.NamedTemporaryFile(suffix=".tgz", delete=False) as tmp:
        tar_path = Path(tmp.name)
    try:
        print(f"Packing {DIST} -> {tar_path.name}")
        with tarfile.open(tar_path, "w:gz") as tar:
            tar.add(DIST, arcname="dist")
        size_mb = tar_path.stat().st_size / (1024 * 1024)
        print(f"Archive {size_mb:.1f} MB")

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
        sftp = ssh.open_sftp()

        remote_tar = f"{RUNTIME}/gnd-dist.tgz"
        remote_dist = f"{RUNTIME}/dist"
        remote_new = f"{RUNTIME}/dist_new"

        print(f"Upload {tar_path.name} -> {remote_tar}")
        t0 = time.time()
        sftp.put(str(tar_path), remote_tar)
        print(f"Upload done in {time.time() - t0:.1f}s")

        code, out = run(
            ssh,
            f"cd {RUNTIME} && rm -rf {remote_new} && mkdir -p {remote_new} && "
            f"tar -xzf gnd-dist.tgz -C {remote_new} --strip-components=1 && "
            f"rm -f gnd-dist.tgz && "
            f"test -f {remote_new}/index.js && test -f {remote_new}/lib/db-config.js && "
            f"rm -rf {remote_dist} && mv {remote_new} {remote_dist} && echo dist_ok",
            timeout=180,
        )
        if code != 0 or "dist_ok" not in out:
            print("Remote extract/swap failed", file=sys.stderr)
            return 1

        # Safety: never leave DB_HOST=localhost (IPv6 ::1 rejection on Hostinger)
        for env_path in (
            f"{RUNTIME}/.env",
            f"/home/u967550282/domains/api.naturalonline.com.ar/public_html/.builds/config/.env",
        ):
            run(
                ssh,
                f"test -f {env_path} && "
                f"grep -q '^DB_HOST=' {env_path} && "
                f"sed -i 's/^DB_HOST=.*/DB_HOST=127.0.0.1/' {env_path} || true",
            )

        if WITH_ENV:
            env_local = API / "hostinger.env"
            if env_local.exists():
                print("Uploading hostinger.env -> runtime .env")
                sftp.put(str(env_local), f"{RUNTIME}/.env")
                run(ssh, f"sed -i 's/^DB_HOST=.*/DB_HOST=127.0.0.1/' {RUNTIME}/.env")
            else:
                print("WARN: --with-env but hostinger.env missing; skipped", file=sys.stderr)

        run(ssh, f"grep '^DB_HOST=' {RUNTIME}/.env || true")
        run(ssh, f"mkdir -p {RUNTIME}/tmp && touch {RUNTIME}/tmp/restart.txt || true")

        sftp.close()
        ssh.close()
        print("SSH sync done. Restart Node next.")
        return 0
    finally:
        try:
            tar_path.unlink(missing_ok=True)
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
