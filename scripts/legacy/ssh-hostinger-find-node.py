#!/usr/bin/env python3
import sys
import paramiko

PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Ntds2026@"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", 65002, "u967550282", password=PASSWORD, timeout=30)

cmds = [
    "ps aux | grep 'node dist/index.js' | grep -v grep",
    "pgrep -af 'node dist/index.js' || true",
    "find /home/u967550282/domains/azure-skunk-643837.hostingersite.com/public_html/.builds -name firebase-admin.js 2>/dev/null",
    "grep -l 'JSON_B64' /home/u967550282/domains/azure-skunk-643837.hostingersite.com/public_html/.builds/**/dist/lib/firebase-admin.js 2>/dev/null || grep -R 'JSON_B64' /home/u967550282/domains/azure-skunk-643837.hostingersite.com/public_html/.builds -l 2>/dev/null | head -5",
]
for cmd in cmds:
    print(f"\n>>> {cmd}")
    _, o, e = ssh.exec_command(cmd, timeout=60)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    print(out or err)
ssh.close()
