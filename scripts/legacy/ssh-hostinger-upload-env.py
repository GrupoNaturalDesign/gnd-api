#!/usr/bin/env python3
"""Upload hostinger.env to Hostinger Node runtime config and restart."""
import os
import sys

import paramiko

HOST, PORT, USER = "82.25.67.184", 65002, "u967550282"
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HOSTINGER_SSH_PASSWORD", "")
DOMAIN = sys.argv[2] if len(sys.argv) > 2 else "azure-skunk-643837.hostingersite.com"
ENV_LOCAL = r"D:\Adobe\Hard Work\Proyectos\GND\gnd\api\hostinger.env"
BUILDS = f"/home/{USER}/domains/{DOMAIN}/public_html/.builds"


def run(ssh, cmd, timeout=120):
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
        print("Usage: python ssh-hostinger-upload-env.py <password> [domain]", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    targets = [
        f"{BUILDS}/config/.env",
        f"{BUILDS}/last-source/.env",
    ]
    for remote in targets:
        run(ssh, f"mkdir -p $(dirname {remote})")
        print(f"\n>>> upload hostinger.env -> {remote}")
        sftp.put(ENV_LOCAL, remote)

    verify = (
        f"grep '^MP_WEBHOOK_URL=' {BUILDS}/config/.env; "
        f"grep '^DB_HOST=' {BUILDS}/config/.env; "
        f"head -c 40 {BUILDS}/config/.env | grep FIREBASE || "
        f"grep '^FIREBASE_ADMIN_SDK_JSON=' {BUILDS}/config/.env | cut -c1-45"
    )
    run(ssh, verify)

    test_cmd = (
        f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; "
        f"cd {BUILDS}/config && node -e \""
        f"require('dotenv').config({{path:'.env'}}); "
        f"const j=process.env.FIREBASE_ADMIN_SDK_JSON; "
        f"if(!j) throw new Error('missing FIREBASE'); "
        f"JSON.parse(j); "
        f"console.log('firebase json ok', process.env.MP_WEBHOOK_URL);\""
    )
    code, _, _ = run(ssh, test_cmd, timeout=60)
    if code != 0:
        return code

    sftp.close()
    ssh.close()
    print("\nEnv uploaded and Firebase JSON validates locally.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
