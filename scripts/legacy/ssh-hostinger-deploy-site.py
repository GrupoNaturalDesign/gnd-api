#!/usr/bin/env python3
"""SSH deploy/finish for a Hostinger Node site (parameterized domain)."""
import os
import sys
import time

import paramiko

HOST = "82.25.67.184"
PORT = 65002
USER = "u967550282"
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HOSTINGER_SSH_PASSWORD", "")
DOMAIN = sys.argv[2] if len(sys.argv) > 2 else "azure-skunk-643837.hostingersite.com"
ENV_LOCAL = r"D:\Adobe\Hard Work\Proyectos\GND\gnd\api\hostinger.env"

DOMAIN_DIR = f"/home/{USER}/domains/{DOMAIN}"
PUBLIC = f"{DOMAIN_DIR}/public_html"
BUILDS = f"{PUBLIC}/.builds"
CONFIG_ENV = f"{BUILDS}/config/.env"
LOG = f"/home/{USER}/api-node-{DOMAIN.split('.')[0]}.log"


def detect_repo(ssh: paramiko.SSHClient) -> str:
    candidates = [
        f"{BUILDS}/source",
        f"{BUILDS}/source/repository",
        f"{BUILDS}/last-source.tmp",
    ]
    for path in candidates:
        code, out, _ = run(
            ssh,
            f"test -f {path}/package.json && head -3 {path}/package.json",
            timeout=30,
        )
        if code == 0 and "gnd-back" in out:
            print(f"Using repo path: {path}")
            return path
    return f"{BUILDS}/source"


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 900) -> tuple[int, str, str]:
    print(f"\n>>> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    print(f"[exit {code}]")
    return code, out, err


def main() -> int:
    if not PASSWORD:
        print("Usage: python ssh-hostinger-deploy-site.py <password> [domain]", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting + deploying to {DOMAIN}...")
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    run(ssh, f"ls -la {BUILDS}/source/package.json 2>/dev/null || ls -la {PUBLIC}")

    repo = detect_repo(ssh)

    for remote in [CONFIG_ENV, f"{repo}/.env", f"{BUILDS}/last-source.tmp/.env"]:
        parent = remote.rsplit("/", 1)[0]
        run(ssh, f"mkdir -p {parent}")
        print(f"\n>>> upload hostinger.env -> {remote}")
        sftp.put(ENV_LOCAL, remote)

    run(
        ssh,
        f"grep -q '^MERCADOPAGO_COLLECTOR_ID=' {CONFIG_ENV} || "
        f"echo 'MERCADOPAGO_COLLECTOR_ID=431460758' >> {CONFIG_ENV}; "
        f"grep '^DB_HOST=' {CONFIG_ENV}; grep '^MERCADOPAGO_COLLECTOR_ID=' {CONFIG_ENV}",
    )

    build_cmd = (
        f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; "
        f"cd {repo} && npm install --include=dev && npm run build && ls -la dist/index.js"
    )
    code, _, _ = run(ssh, build_cmd, timeout=900)
    if code != 0:
        return code

    run(ssh, f"head -5 {repo}/package.json")

    for cmd in [
        "ps aux | grep 'node dist/index.js' | grep -v grep || true",
        f"tail -5 {LOG} 2>/dev/null || true",
        "curl -s http://127.0.0.1:3002/api/health 2>/dev/null || true",
    ]:
        run(ssh, cmd, timeout=30)

    sftp.close()
    ssh.close()
    print(f"\nSSH finish complete for {DOMAIN}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
