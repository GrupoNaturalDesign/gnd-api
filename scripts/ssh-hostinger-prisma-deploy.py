#!/usr/bin/env python3
"""
Sube schema Prisma + migración SQL y ejecuta prisma generate en Hostinger.

Requerido tras cambios en schema.prisma cuando CI solo sincroniza dist/.

Env: HOSTINGER_SSH_PASSWORD (required)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

API = Path(__file__).resolve().parent.parent
RUNTIME = os.environ.get(
    "HOSTINGER_RUNTIME",
    "/home/u967550282/domains/api.naturalonline.com.ar/nodejs",
)
HOST = os.environ.get("HOSTINGER_SSH_HOST") or "82.25.67.184"
PORT = int(os.environ.get("HOSTINGER_SSH_PORT") or "65002")
USER = os.environ.get("HOSTINGER_SSH_USER") or "u967550282"
PASSWORD = os.environ.get("HOSTINGER_SSH_PASSWORD") or ""


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 300) -> int:
    print(f">>> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    print(f"[exit {code}]")
    return code


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = remote_dir.strip("/").split("/")
    path = ""
    for part in parts:
        path += "/" + part
        try:
            sftp.stat(path)
        except OSError:
            sftp.mkdir(path)


def upload(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    ensure_remote_dir(sftp, str(Path(remote).parent).replace("\\", "/"))
    print(f"upload {local} -> {remote}")
    sftp.put(str(local), remote)


def main() -> int:
    if not PASSWORD:
        print("HOSTINGER_SSH_PASSWORD required", file=sys.stderr)
        return 1

    uploads = [
        (API / "prisma" / "schema.prisma", f"{RUNTIME}/prisma/schema.prisma"),
        (
            API / "migrations" / "add_producto_padre_colores_aprobados.sql",
            f"{RUNTIME}/migrations/add_producto_padre_colores_aprobados.sql",
        ),
        (
            API / "scripts" / "hostinger-prisma-prod-deploy.mjs",
            f"{RUNTIME}/scripts/hostinger-prisma-prod-deploy.mjs",
        ),
    ]
    for local, _remote in uploads:
        if not local.exists():
            print(f"Missing local file: {local}", file=sys.stderr)
            return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    for local, remote in uploads:
        upload(sftp, local, remote)

    node_enable = "source /opt/alt/alt-nodejs20/enable 2>/dev/null"
    cmd = f"{node_enable}; cd {RUNTIME} && node scripts/hostinger-prisma-prod-deploy.mjs"
    code = run(ssh, cmd, timeout=600)

    sftp.close()
    ssh.close()
    if code != 0:
        return code
    print("Prisma deploy on Hostinger OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
