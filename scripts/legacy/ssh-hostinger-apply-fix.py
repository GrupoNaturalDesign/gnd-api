#!/usr/bin/env python3
"""Upload env + patched dist to Hostinger and restart Node process."""
import os
import sys
import time

import paramiko

HOST, PORT, USER = "82.25.67.184", 65002, "u967550282"
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HOSTINGER_SSH_PASSWORD", "")
DOMAIN = "azure-skunk-643837.hostingersite.com"
API = r"D:\Adobe\Hard Work\Proyectos\GND\gnd\api"
BUILDS = f"/home/{USER}/domains/{DOMAIN}/public_html/.builds"
APP = f"{BUILDS}/last-source"


def run(ssh, cmd, timeout=180):
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
    return code


def main() -> int:
    if not PASSWORD:
        print("Usage: ssh-hostinger-apply-fix.py <password>", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    env_local = os.path.join(API, "hostinger.env")
    uploads = [
        (env_local, f"{BUILDS}/config/.env"),
        (env_local, f"{APP}/.env"),
        (os.path.join(API, "dist", "lib", "firebase-admin.js"), f"{APP}/dist/lib/firebase-admin.js"),
        (os.path.join(API, "dist", "index.js"), f"{APP}/dist/index.js"),
    ]
    for local, remote in uploads:
        run(ssh, f"mkdir -p $(dirname {remote})")
        print(f"upload {local} -> {remote}")
        sftp.put(local, remote)

    run(
        ssh,
        f"grep '^FIREBASE_ADMIN_SDK_JSON_B64=' {BUILDS}/config/.env | cut -c1-60; "
        f"grep '^MP_WEBHOOK_URL=' {BUILDS}/config/.env",
    )

    sftp.close()
    ssh.close()
    print("\nFiles uploaded. Restart Node from Hostinger platform next.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
