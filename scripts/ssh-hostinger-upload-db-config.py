#!/usr/bin/env python3
"""Upload db-config.js fix + ensure DB_HOST=127.0.0.1, then verify normalize works."""
import os
import sys
from pathlib import Path

import paramiko

HOST, PORT, USER = "82.25.67.184", 65002, "u967550282"
PASSWORD = os.environ.get("HOSTINGER_SSH_PASSWORD") or sys.argv[1]
API = Path(__file__).resolve().parent.parent
RUNTIME = "/home/u967550282/domains/api.naturalonline.com.ar/nodejs"
BUILDS = "/home/u967550282/domains/api.naturalonline.com.ar/public_html/.builds/config/.env"


def run(ssh, cmd, timeout=60):
    print(f"\n>>> {cmd[:160]}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write((out + (("\n" + err) if err.strip() else "") + f"\n[exit {code}]\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()
    return code


def main() -> int:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()

    local = API / "dist" / "lib" / "db-config.js"
    remote = f"{RUNTIME}/dist/lib/db-config.js"
    print(f"upload {local} -> {remote}")
    sftp.put(str(local), remote)

    # Also patch .env files
    for path in (f"{RUNTIME}/.env", BUILDS):
        run(ssh, f"sed -i 's/^DB_HOST=.*/DB_HOST=127.0.0.1/' {path}; grep '^DB_HOST=' {path}")

    # Confirm normalizeMysqlHost present
    run(ssh, f"grep -n '127.0.0.1\\|normalizeMysqlHost\\|override: true' {remote} | head -20")

    sftp.close()
    ssh.close()
    print("\nUploaded. Restart Node next.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
