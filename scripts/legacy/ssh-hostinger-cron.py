import paramiko
import time

PUBLIC = "/home/u967550282/domains/slategray-manatee-407634.hostingersite.com/public_html"
REPO = f"{PUBLIC}/.builds/source/repository"
LOG = "/home/u967550282/api-node.log"
START_SH = "/home/u967550282/start-gnd-api.sh"

START_SCRIPT = f"""#!/bin/bash
source /opt/alt/alt-nodejs20/enable 2>/dev/null
cd {REPO}
if ! pgrep -f 'node dist/index.js' >/dev/null 2>&1; then
  nohup node dist/index.js >> {LOG} 2>&1 &
fi
"""

CRON_LINE = f"*/5 * * * * {START_SH} >/dev/null 2>&1"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password="Ntds2026@", timeout=30)
sftp = ssh.open_sftp()

with sftp.open(START_SH, "w") as f:
    f.write(START_SCRIPT)
ssh.exec_command(f"chmod +x {START_SH}")[1].channel.recv_exit_status()

# Remove broken htaccess proxy
ssh.exec_command(f"rm -f {PUBLIC}/.htaccess")[1].channel.recv_exit_status()

# Install cron keepalive
_, o, _ = ssh.exec_command(
    f"(crontab -l 2>/dev/null | grep -v start-gnd-api; echo '{CRON_LINE}') | crontab -",
    timeout=30,
)
o.channel.recv_exit_status()

# Start now
_, o, _ = ssh.exec_command(START_SH, timeout=30)
o.channel.recv_exit_status()
time.sleep(8)

for c in [
    "crontab -l | grep gnd-api || true",
    "ps aux | grep 'node dist/index.js' | grep -v grep",
    "curl -s http://127.0.0.1:3002/api/health",
    f"tail -5 {LOG}",
]:
    print(">>>", c)
    _, o, _ = ssh.exec_command(c, timeout=30)
    print(o.read().decode("utf-8", "replace"))

sftp.close()
ssh.close()
