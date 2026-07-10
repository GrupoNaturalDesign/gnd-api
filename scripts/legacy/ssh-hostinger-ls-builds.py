#!/usr/bin/env python3
import sys
import paramiko

HOST, PORT, USER = "82.25.67.184", 65002, "u967550282"
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Ntds2026@"
DOMAIN = sys.argv[2] if len(sys.argv) > 2 else "azure-skunk-643837.hostingersite.com"
BASE = f"/home/{USER}/domains/{DOMAIN}/public_html"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)

cmds = [
    f"find {BASE}/.builds -maxdepth 4 -type f -name package.json 2>/dev/null",
    f"ls -laR {BASE}/.builds 2>/dev/null | head -120",
    f"find {BASE}/.builds -name '.env' 2>/dev/null",
]
for cmd in cmds:
    print(f"\n>>> {cmd}")
    _, o, e = ssh.exec_command(cmd, timeout=60)
    print(o.read().decode('utf-8', 'replace'))
    err = e.read().decode('utf-8', 'replace')
    if err.strip():
        print(err)
ssh.close()
