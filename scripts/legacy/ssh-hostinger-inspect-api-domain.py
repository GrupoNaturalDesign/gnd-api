#!/usr/bin/env python3
import sys
import paramiko

PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Ntds2026@"
BASE = "/home/u967550282/domains/api.naturalonline.com.ar"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", 65002, "u967550282", password=PASSWORD, timeout=30)
cmds = [
    f"ls -laR {BASE} 2>/dev/null | head -80",
    f"find {BASE} -name firebase-admin.js 2>/dev/null",
    f"find {BASE} -name '.env' 2>/dev/null",
    f"grep -R 'JSON_B64' {BASE} 2>/dev/null | head -3",
    f"grep FIREBASE {BASE}/nodejs/.env 2>/dev/null | cut -c1-90 || grep FIREBASE {BASE}/public_html/.builds/config/.env 2>/dev/null | cut -c1-90",
]
for cmd in cmds:
    print(f"\n>>> {cmd}")
    _, o, e = ssh.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace") or e.read().decode("utf-8", errors="replace"))
ssh.close()
