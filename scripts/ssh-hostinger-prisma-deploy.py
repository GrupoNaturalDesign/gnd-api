#!/usr/bin/env python3
"""
Sube Prisma Client generado en CI + schema + migración SQL a Hostinger.

Evita `prisma generate` en el servidor (prisma CLI está en devDependencies).

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


def upload_file(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    ensure_remote_dir(sftp, str(Path(remote).parent).replace("\\", "/"))
    print(f"upload {local} -> {remote}")
    sftp.put(str(local), remote)


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
        if count % 100 == 0:
            print(f"  uploaded {count} files to {remote_dir}...")
    return count


def resolve_npm_package(api: Path, *parts: str) -> Path | None:
    direct = api.joinpath("node_modules", *parts)
    if direct.exists():
        return direct
    pnpm_root = api / "node_modules" / ".pnpm"
    if not pnpm_root.is_dir() or len(parts) < 2 or not parts[0].startswith("@"):
        return None
    scope, name = parts[0], parts[1]
    suffix = f"/{'/'.join(parts[2:])}" if len(parts) > 2 else ""
    pattern = f"{scope}+{name}@*/node_modules/{scope}/{name}{suffix}"
    for candidate in pnpm_root.glob(pattern):
        if candidate.exists():
            return candidate
    return None


def main() -> int:
    if not PASSWORD:
        print("HOSTINGER_SSH_PASSWORD required", file=sys.stderr)
        return 1

    prisma_client = resolve_npm_package(API, "@prisma", "client")
    prisma_engines = API / "node_modules" / ".prisma"

    if prisma_client is None:
        print("Missing local node_modules/@prisma/client — run npm run build in CI first", file=sys.stderr)
        return 1

    files = [
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
    for local, _remote in files:
        if not local.exists():
            print(f"Missing local file: {local}", file=sys.stderr)
            return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    for local, remote in files:
        upload_file(sftp, local, remote)

    remote_client = f"{RUNTIME}/node_modules/@prisma/client"
    remote_client_new = f"{RUNTIME}/node_modules/@prisma/client_new"
    print(f"Sync {prisma_client} -> {remote_client}")
    run(ssh, f"rm -rf {remote_client_new} && mkdir -p {remote_client_new}")
    n_client = upload_tree(sftp, prisma_client, remote_client_new)
    print(f"Uploaded {n_client} files to @prisma/client_new")
    run(ssh, f"rm -rf {remote_client} && mv {remote_client_new} {remote_client}")

    if prisma_engines.is_dir():
        remote_engines = f"{RUNTIME}/node_modules/.prisma"
        remote_engines_new = f"{RUNTIME}/node_modules/.prisma_new"
        print(f"Sync {prisma_engines} -> {remote_engines}")
        run(ssh, f"rm -rf {remote_engines_new} && mkdir -p {remote_engines_new}")
        n_engines = upload_tree(sftp, prisma_engines, remote_engines_new)
        print(f"Uploaded {n_engines} files to .prisma_new")
        run(ssh, f"rm -rf {remote_engines} && mv {remote_engines_new} {remote_engines}")

    node_enable = "source /opt/alt/alt-nodejs20/enable 2>/dev/null"
    cmd = f"{node_enable}; cd {RUNTIME} && node scripts/hostinger-prisma-prod-deploy.mjs"
    code = run(ssh, cmd, timeout=300)

    sftp.close()
    ssh.close()
    if code != 0:
        return code
    print("Prisma client + migration on Hostinger OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
