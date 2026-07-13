#!/usr/bin/env python3
"""
Sync local api/dist → Hostinger runtime nodejs/dist (push-to-deploy).

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


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[int, str]:
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


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = remote_dir.strip("/").split("/")
    path = ""
    for part in parts:
        path += "/" + part
        try:
            sftp.stat(path)
        except OSError:
            sftp.mkdir(path)


def upload_tree(sftp: paramiko.SFTPClient, local_dir: Path, remote_dir: str) -> int:
    count = 0
    for path in local_dir.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(local_dir).as_posix()
        remote = f"{remote_dir}/{rel}"
        ensure_remote_dir(sftp, str(Path(remote).parent).replace("\\", "/"))
        sftp.put(str(path), remote)
        count += 1
        if count % 50 == 0:
            print(f"  uploaded {count} files...")
    return count


def main() -> int:
    if not PASSWORD:
        print("HOSTINGER_SSH_PASSWORD required", file=sys.stderr)
        return 1
    if not (DIST / "index.js").exists():
        print("Run npm run build first (dist/index.js missing)", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    remote_dist = f"{RUNTIME}/dist"
    print(f"Sync {DIST} → {remote_dist}")
    # Replace dist atomically-ish: upload to dist_new then swap
    remote_new = f"{RUNTIME}/dist_new"
    run(ssh, f"rm -rf {remote_new} && mkdir -p {remote_new}")
    n = upload_tree(sftp, DIST, remote_new)
    print(f"Uploaded {n} files to dist_new")
    run(ssh, f"rm -rf {remote_dist} && mv {remote_new} {remote_dist}")

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
            print("Uploading hostinger.env → runtime .env")
            sftp.put(str(env_local), f"{RUNTIME}/.env")
            run(ssh, f"sed -i 's/^DB_HOST=.*/DB_HOST=127.0.0.1/' {RUNTIME}/.env")
        else:
            print("WARN: --with-env but hostinger.env missing; skipped", file=sys.stderr)

    run(ssh, f"grep '^DB_HOST=' {RUNTIME}/.env || true")
    run(ssh, f"test -f {remote_dist}/index.js && test -f {remote_dist}/lib/db-config.js && echo dist_ok")

    sftp.close()
    ssh.close()
    print("SSH sync done. Restart Node next.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
