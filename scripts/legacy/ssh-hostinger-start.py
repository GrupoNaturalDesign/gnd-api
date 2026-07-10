import paramiko

REPO = "/home/u967550282/domains/slategray-manatee-407634.hostingersite.com/public_html/.builds/source/repository"
LOG = "/home/u967550282/api-node.log"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password="Ntds2026@", timeout=30)

for cmd in [
    "source /opt/alt/alt-nodejs20/enable 2>/dev/null; pkill -u u967550282 -f 'node dist/index.js' || true",
    f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; cd {REPO}; nohup node dist/index.js > {LOG} 2>&1 &",
]:
    print(">>>", cmd)
    _, o, e = ssh.exec_command(cmd, timeout=30)
    o.channel.recv_exit_status()
    print(o.read().decode("utf-8", "replace"))
    print(e.read().decode("utf-8", "replace"))

import time
time.sleep(10)

for cmd in [
    "ps aux | grep 'node dist/index.js' | grep -v grep",
    f"tail -35 {LOG}",
    "curl -s http://127.0.0.1:3002/health",
    "curl -s http://127.0.0.1:3002/api/health",
]:
    print(">>>", cmd)
    _, o, _ = ssh.exec_command(cmd, timeout=30)
    print(o.read().decode("utf-8", "replace"))

ssh.close()
