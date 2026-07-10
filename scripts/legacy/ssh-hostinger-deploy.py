#!/usr/bin/env python3
"""One-shot SSH deploy for GND API on Hostinger Node site."""
import os
import sys
import time

import paramiko

HOST = "82.25.67.184"
PORT = 65002
USER = "u967550282"
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HOSTINGER_SSH_PASSWORD", "")
DOMAIN_DIR = "/home/u967550282/domains/slategray-manatee-407634.hostingersite.com"
PUBLIC = f"{DOMAIN_DIR}/public_html"
BUILDS = f"{PUBLIC}/.builds"
GND_API_DIR = f"{DOMAIN_DIR}/gnd-api"
REPO = f"{BUILDS}/source/repository"
LAST_SOURCE = f"{BUILDS}/last-source.tmp"
CONFIG_ENV = f"{BUILDS}/config/.env"
LOG = "/home/u967550282/api-node.log"
START_SH = "/home/u967550282/start-gnd-api.sh"
ENV_LOCAL = r"D:\Adobe\Hard Work\Proyectos\GND\gnd\api\hostinger.env"

START_SCRIPT = f"""#!/bin/bash
source /opt/alt/alt-nodejs20/enable 2>/dev/null
cd {REPO}
if ! pgrep -f 'node dist/index.js' >/dev/null 2>&1; then
  nohup node dist/index.js >> {LOG} 2>&1 &
fi
"""


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
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
        print("Usage: python ssh-hostinger-deploy.py <ssh-password>", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST}:{PORT}...")
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    run(
        ssh,
        f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; node -v; npm -v; "
        f"head -3 {REPO}/package.json 2>/dev/null || true",
    )

    run(ssh, f"rm -rf {GND_API_DIR}")
    code, _, _ = run(
        ssh,
        f"cd {DOMAIN_DIR} && git clone https://github.com/GrupoNaturalDesign/gnd-api.git gnd-api && "
        f"cd gnd-api && git checkout main && head -8 package.json",
        timeout=300,
    )
    if code != 0:
        return code

    for remote in [f"{GND_API_DIR}/.env", CONFIG_ENV, f"{REPO}/.env"]:
        print(f"\n>>> upload hostinger.env -> {remote}")
        # ensure parent exists for repo path (may be altiplano tree)
        try:
            sftp.put(ENV_LOCAL, remote)
        except OSError:
            run(ssh, f"mkdir -p $(dirname {remote})")
            sftp.put(ENV_LOCAL, remote)

    run(
        ssh,
        f"grep -q '^MERCADOPAGO_COLLECTOR_ID=' {GND_API_DIR}/.env || "
        f"echo 'MERCADOPAGO_COLLECTOR_ID=431460758' >> {GND_API_DIR}/.env; "
        f"grep '^DB_HOST=' {GND_API_DIR}/.env; grep '^MERCADOPAGO_COLLECTOR_ID=' {GND_API_DIR}/.env",
    )

    build_cmd = (
        f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; "
        f"cd {GND_API_DIR} && npm install --include=dev && npm run build && ls -la dist/index.js"
    )
    code, _, _ = run(ssh, build_cmd, timeout=900)
    if code != 0:
        return code

    run(
        ssh,
        f"rm -rf {REPO}.altiplano.bak && mv {REPO} {REPO}.altiplano.bak 2>/dev/null; "
        f"cp -a {GND_API_DIR} {REPO} && "
        f"cp -a {GND_API_DIR} {LAST_SOURCE} && "
        f"cp {GND_API_DIR}/package.json {BUILDS}/config/package.json.tmp && "
        f"cp {GND_API_DIR}/.env {CONFIG_ENV} && "
        f"rm -f {PUBLIC}/.htaccess && "
        f"head -8 {REPO}/package.json && ls -la {REPO}/dist/index.js",
    )

    with sftp.open(START_SH, "w") as f:
        f.write(START_SCRIPT)
    run(ssh, f"chmod +x {START_SH}")

    cron_line = f"*/5 * * * * {START_SH} >/dev/null 2>&1"
    run(
        ssh,
        f"(crontab -l 2>/dev/null | grep -v start-gnd-api; echo '{cron_line}') | crontab -",
    )

    run(ssh, "pkill -u u967550282 -f 'node dist/index.js' || true")
    run(ssh, START_SH)
    time.sleep(8)

    for cmd in [
        "ps aux | grep 'node dist/index.js' | grep -v grep",
        f"tail -8 {LOG}",
        "curl -s http://127.0.0.1:3002/api/health",
        f"head -3 {REPO}/package.json",
    ]:
        run(ssh, cmd, timeout=30)

    sftp.close()
    ssh.close()
    print("\nSSH deploy complete. API running on port 3002 (internal).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
