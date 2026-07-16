#!/usr/bin/env python3
"""
Ejecuta sync de catálogo en el runtime Hostinger (acceso DB local 127.0.0.1).

Env:
  HOSTINGER_SSH_PASSWORD (required)
  HOSTINGER_SSH_HOST, HOSTINGER_SSH_PORT, HOSTINGER_SSH_USER
  HOSTINGER_RUNTIME

Args:
  --rubros-only   Solo rubros + subrubros (rápido, post-deploy CI)
  --full          Rubros + subrubros + productos + stock (lento)
  --empresa-id N  default 1
"""
from __future__ import annotations

import os
import sys

import paramiko

RUNTIME = os.environ.get(
    "HOSTINGER_RUNTIME",
    "/home/u967550282/domains/api.naturalonline.com.ar/nodejs",
)
HOST = os.environ.get("HOSTINGER_SSH_HOST") or "82.25.67.184"
PORT = int(os.environ.get("HOSTINGER_SSH_PORT") or "65002")
USER = os.environ.get("HOSTINGER_SSH_USER") or "u967550282"
PASSWORD = os.environ.get("HOSTINGER_SSH_PASSWORD") or ""


def parse_args() -> tuple[str, int]:
    rubros_only = "--rubros-only" in sys.argv
    full = "--full" in sys.argv
    if rubros_only and full:
        print("Use solo uno: --rubros-only o --full", file=sys.stderr)
        sys.exit(2)
    mode_flag = "--rubros-only" if rubros_only or not full else ""
    empresa_id = 1
    for i, arg in enumerate(sys.argv):
        if arg == "--empresa-id" and i + 1 < len(sys.argv):
            empresa_id = int(sys.argv[i + 1])
    return mode_flag, empresa_id


def main() -> int:
    if not PASSWORD:
        print("HOSTINGER_SSH_PASSWORD required", file=sys.stderr)
        return 1

    mode_flag, empresa_id = parse_args()
    timeout = 900 if mode_flag != "--rubros-only" else 180
    extra = f" {mode_flag}" if mode_flag else ""
    cmd = (
        f"cd {RUNTIME} && "
        f"test -f dist/scripts/sync-catalogo.js && "
        f"node dist/scripts/sync-catalogo.js {empresa_id}{extra}"
    )

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    print(f">>> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    ssh.close()
    if code != 0:
        print(f"sync-catalogo exit {code}", file=sys.stderr)
        return code
    print("SSH sync-catalogo OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
