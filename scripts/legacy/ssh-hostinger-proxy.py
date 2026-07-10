import paramiko
import time

PUBLIC = "/home/u967550282/domains/slategray-manatee-407634.hostingersite.com/public_html"
REPO = f"{PUBLIC}/.builds/source/repository"
LOG = "/home/u967550282/api-node.log"

HTACCESS = """RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3002/$1 [P,L]
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password="Ntds2026@", timeout=30)
sftp = ssh.open_sftp()

# .htaccess proxy to Node on 3002
with sftp.open(f"{PUBLIC}/.htaccess", "w") as f:
    f.write(HTACCESS)
print("Wrote .htaccess proxy")

cmds = [
    f"cat {PUBLIC}/.htaccess",
    "source /opt/alt/alt-nodejs20/enable 2>/dev/null; pkill -u u967550282 -f 'node dist/index.js' || true",
    f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; cd {REPO}; nohup node dist/index.js > {LOG} 2>&1 &",
]
for c in cmds:
    print(">>>", c)
    _, o, _ = ssh.exec_command(c, timeout=30)
    o.channel.recv_exit_status()
    print(o.read().decode("utf-8", "replace"))

time.sleep(8)

for c in [
    "ps aux | grep 'node dist/index.js' | grep -v grep",
    "curl -s http://127.0.0.1:3002/api/health",
    "curl -s https://slategray-manatee-407634.hostingersite.com/api/health",
]:
    print(">>>", c)
    _, o, _ = ssh.exec_command(c, timeout=30)
    print(o.read().decode("utf-8", "replace"))

sftp.close()
ssh.close()
