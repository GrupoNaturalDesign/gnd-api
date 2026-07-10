import paramiko
import time

BUILDS = "/home/u967550282/domains/slategray-manatee-407634.hostingersite.com/public_html/.builds"
REPO = f"{BUILDS}/source/repository"
LOG = "/home/u967550282/api-node.log"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password="Ntds2026@", timeout=30)

cmds = [
    f"cp {REPO}/package.json {BUILDS}/config/package.json.tmp",
    f"grep '\"start\"' {BUILDS}/config/package.json.tmp",
    "source /opt/alt/alt-nodejs20/enable 2>/dev/null; pkill -u u967550282 -f 'node dist/index.js' || true",
    f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; cd {REPO}; nohup node dist/index.js > {LOG} 2>&1 &",
]
for c in cmds:
    print(">>>", c)
    _, o, e = ssh.exec_command(c, timeout=60)
    o.channel.recv_exit_status()
    print(o.read().decode("utf-8", "replace"))
    print(e.read().decode("utf-8", "replace"))

time.sleep(8)

for c in [
    "ps aux | grep 'node dist/index.js' | grep -v grep",
    "curl -s http://127.0.0.1:3002/api/health",
    "curl -sI https://slategray-manatee-407634.hostingersite.com/api/health | head -10",
    "curl -s https://slategray-manatee-407634.hostingersite.com/api/health",
]:
    print(">>>", c)
    _, o, _ = ssh.exec_command(c, timeout=60)
    print(o.read().decode("utf-8", "replace"))

ssh.close()
