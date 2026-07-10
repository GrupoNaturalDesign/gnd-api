#!/usr/bin/env python3
import sys
import paramiko

HOST, PORT, USER = "82.25.67.184", 65002, "u967550282"
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Ntds2026@"
DOMAIN = "azure-skunk-643837.hostingersite.com"
APP = f"/home/{USER}/domains/{DOMAIN}/public_html/.builds/last-source"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
cmd = (
    f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; "
    f"cd {APP} && node -e \""
    f"require('dotenv').config({{path:'../config/.env'}}); "
    f"JSON.parse(process.env.FIREBASE_ADMIN_SDK_JSON); "
    f"console.log('firebase ok'); "
    f"console.log('MP_WEBHOOK_URL=', process.env.MP_WEBHOOK_URL);\""
)
_, o, e = ssh.exec_command(cmd, timeout=60)
print(o.read().decode())
err = e.read().decode()
if err:
    print(err, file=sys.stderr)
print('exit', o.channel.recv_exit_status())
ssh.close()
