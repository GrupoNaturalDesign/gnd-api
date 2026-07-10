#!/usr/bin/env python3
import json
import re
import sys
import paramiko

PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Ntds2026@"
path = "/home/u967550282/domains/azure-skunk-643837.hostingersite.com/public_html/.builds/config/.env"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password=PASSWORD, timeout=30)
_, o, _ = ssh.exec_command(f"grep '^FIREBASE_ADMIN_SDK_JSON=' {path}", timeout=30)
line = o.read().decode().strip()
m = re.match(r"FIREBASE_ADMIN_SDK_JSON='(.+)'$", line)
if not m:
    raise SystemExit(f"Could not parse firebase line: {line[:100]}")
parsed = json.loads(m.group(1))
print("firebase json ok, project_id=", parsed.get("project_id"))
_, o2, _ = ssh.exec_command(f"grep '^MP_WEBHOOK_URL=' {path}", timeout=30)
print(o2.read().decode().strip())
ssh.close()
