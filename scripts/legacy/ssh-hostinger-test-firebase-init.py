#!/usr/bin/env python3
import sys
import paramiko

PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Ntds2026@"
APP = "/home/u967550282/domains/azure-skunk-643837.hostingersite.com/public_html/.builds/last-source"
cmd = (
    f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; cd {APP} && node -e \""
    f"require('dotenv').config({{path:'.env', override:true}});"
    f"const {{ getFirebaseAdmin }} = require('./dist/lib/firebase-admin');"
    f"getFirebaseAdmin();"
    f"console.log('firebase init ok');\""
)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password=PASSWORD, timeout=30)
_, o, e = ssh.exec_command(cmd, timeout=60)
print(o.read().decode())
err = e.read().decode()
if err:
    print(err, file=sys.stderr)
print("exit", o.channel.recv_exit_status())
ssh.close()
