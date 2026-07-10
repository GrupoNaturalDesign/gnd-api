#!/usr/bin/env python3
"""Apply Firebase B64 fix to the REAL runtime: api.naturalonline.com.ar/nodejs/"""
import os
import sys
from pathlib import Path

import paramiko

HOST, PORT, USER = "82.25.67.184", 65002, "u967550282"
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HOSTINGER_SSH_PASSWORD", "")
API_LOCAL = Path(__file__).resolve().parent.parent
RUNTIME = "/home/u967550282/domains/api.naturalonline.com.ar/nodejs"
BUILDS_CONFIG = "/home/u967550282/domains/api.naturalonline.com.ar/public_html/.builds/config/.env"


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
    return code, out


def main() -> int:
    if not PASSWORD:
        print("Usage: ssh-hostinger-apply-api-fix.py <password>", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    env_local = API_LOCAL / "hostinger.env"
    uploads = [
        (env_local, f"{RUNTIME}/.env"),
        (env_local, BUILDS_CONFIG),
        (API_LOCAL / "dist" / "lib" / "firebase-admin.js", f"{RUNTIME}/dist/lib/firebase-admin.js"),
        (API_LOCAL / "dist" / "index.js", f"{RUNTIME}/dist/index.js"),
    ]
    for local, remote in uploads:
        print(f"upload {local} -> {remote}")
        sftp.put(str(local), remote)

    run(ssh, f"grep '^FIREBASE_ADMIN_SDK_JSON_B64=' {RUNTIME}/.env | cut -c1-60")
    run(ssh, f"grep 'JSON_B64' {RUNTIME}/dist/lib/firebase-admin.js | head -1")

    test = (
        f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; cd {RUNTIME} && node -e \""
        f"require('dotenv').config({{path:'.env', override:true}});"
        f"const {{ getFirebaseAdmin }} = require('./dist/lib/firebase-admin');"
        f"getFirebaseAdmin(); console.log('firebase init ok');\""
    )
    code, _ = run(ssh, test, timeout=60)
    if code != 0:
        sftp.close()
        ssh.close()
        return code

    sftp.close()
    ssh.close()
    print("\nFix applied to api.naturalonline.com.ar/nodejs — restart Node next.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
