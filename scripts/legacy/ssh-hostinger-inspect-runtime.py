#!/usr/bin/env python3
import sys
import paramiko

PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Ntds2026@"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", 65002, "u967550282", password=PASSWORD, timeout=30)
cmds = [
    "ps aux | grep -E 'node|lsphp|passenger' | grep u967550282 | grep -v grep | head -20",
    "curl -s https://api.naturalonline.com.ar/api/health",
    "ls -la /home/u967550282/domains/azure-skunk-643837.hostingersite.com/public_html/.builds/",
    "head -3 /home/u967550282/domains/azure-skunk-643837.hostingersite.com/public_html/.builds/last-source/dist/lib/firebase-admin.js",
    "grep FIREBASE /home/u967550282/domains/azure-skunk-643837.hostingersite.com/public_html/.builds/config/.env | cut -c1-80",
]
for cmd in cmds:
    print(f"\n>>> {cmd}")
    _, o, e = ssh.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace") or e.read().decode("utf-8", errors="replace"))
ssh.close()
