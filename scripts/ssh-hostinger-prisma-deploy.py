#!/usr/bin/env python3
"""
Sube Prisma Client generado en CI + schema + migración SQL a Hostinger.

Usa tar.gz (rápido en CI) o fallback SFTP. No corre prisma generate en el servidor.

Env: HOSTINGER_SSH_PASSWORD (required)
"""
from __future__ import annotations

import os
import subprocess
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


def run_ok(ssh: paramiko.SSHClient, cmd: str, timeout: int = 300) -> None:
    if run(ssh, cmd, timeout=timeout) != 0:
        raise RuntimeError(f"Command failed: {cmd}")


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


def prisma_tar_members(api: Path) -> list[str]:
    """Paths relative to node_modules for tar (npm ci layout on GitHub Actions)."""
    nm = api / "node_modules"
    members: list[str] = []
    if (nm / "@prisma" / "client").exists():
        members.append("@prisma/client")
    elif resolve_npm_package(api, "@prisma", "client"):
        # pnpm dev: symlink usually exists; if not, fall back to SFTP tree upload
        members.append("@prisma/client")
    if (nm / ".prisma").is_dir():
        members.append(".prisma")
    return members


def create_prisma_tar(api: Path, tar_path: Path) -> list[str]:
    members = prisma_tar_members(api)
    if not members:
        raise RuntimeError("No Prisma artifacts under node_modules — run npm run build first")
    nm = api / "node_modules"
    cmd = ["tar", "czf", str(tar_path), "-C", str(nm), *members]
    print(f">>> {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    print(f"Created {tar_path} ({tar_path.stat().st_size} bytes)")
    return members


def sync_prisma_via_tar(ssh: paramiko.SSHClient, sftp: paramiko.SFTPClient, api: Path) -> None:
    tar_path = api / ".deploy-prisma-artifacts.tar.gz"
    remote_tar = f"{RUNTIME}/.deploy-prisma-artifacts.tar.gz"
    try:
        members = create_prisma_tar(api, tar_path)
        print(f"Tar members: {members}")
        upload_file(sftp, tar_path, remote_tar)
        run_ok(ssh, f"mkdir -p {RUNTIME}/node_modules")
        run_ok(ssh, f"cd {RUNTIME}/node_modules && tar xzf {remote_tar}")
        run_ok(ssh, f"rm -f {remote_tar}")
    finally:
        tar_path.unlink(missing_ok=True)


def sync_prisma_via_sftp(ssh: paramiko.SSHClient, sftp: paramiko.SFTPClient, api: Path) -> None:
    prisma_client = resolve_npm_package(api, "@prisma", "client")
    prisma_engines = api / "node_modules" / ".prisma"
    if prisma_client is None:
        raise RuntimeError("Missing @prisma/client — run npm run build first")

    remote_client = f"{RUNTIME}/node_modules/@prisma/client"
    remote_client_new = f"{RUNTIME}/node_modules/@prisma/client_new"
    print(f"SFTP sync {prisma_client} -> {remote_client}")
    run_ok(ssh, f"rm -rf {remote_client_new} && mkdir -p {remote_client_new}")
    n_client = upload_tree(sftp, prisma_client, remote_client_new)
    print(f"Uploaded {n_client} files to @prisma/client_new")
    run_ok(ssh, f"rm -rf {remote_client} && mv {remote_client_new} {remote_client}")

    if prisma_engines.is_dir():
        remote_engines = f"{RUNTIME}/node_modules/.prisma"
        remote_engines_new = f"{RUNTIME}/node_modules/.prisma_new"
        run_ok(ssh, f"rm -rf {remote_engines_new} && mkdir -p {remote_engines_new}")
        n_engines = upload_tree(sftp, prisma_engines, remote_engines_new)
        print(f"Uploaded {n_engines} files to .prisma_new")
        run_ok(ssh, f"rm -rf {remote_engines} && mv {remote_engines_new} {remote_engines}")


def main() -> int:
    if not PASSWORD:
        print("HOSTINGER_SSH_PASSWORD required", file=sys.stderr)
        return 1

    client_nm = API / "node_modules" / "@prisma" / "client"
    if not client_nm.exists() and resolve_npm_package(API, "@prisma", "client") is None:
        print("Missing local @prisma/client — run npm run build in CI first", file=sys.stderr)
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

    try:
        for local, remote in files:
            upload_file(sftp, local, remote)

        use_tar = os.name != "nt" and prisma_tar_members(API)
        if use_tar:
            try:
                sync_prisma_via_tar(ssh, sftp, API)
            except (FileNotFoundError, subprocess.CalledProcessError) as e:
                print(f"WARN: tar sync failed ({e}), falling back to SFTP", file=sys.stderr)
                sync_prisma_via_sftp(ssh, sftp, API)
        else:
            sync_prisma_via_sftp(ssh, sftp, API)

        node_enable = "source /opt/alt/alt-nodejs20/enable 2>/dev/null"
        cmd = f"{node_enable}; cd {RUNTIME} && node scripts/hostinger-prisma-prod-deploy.mjs"
        code = run(ssh, cmd, timeout=300)
        if code != 0:
            return code
    finally:
        sftp.close()
        ssh.close()

    print("Prisma client + migration on Hostinger OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(1) from e
