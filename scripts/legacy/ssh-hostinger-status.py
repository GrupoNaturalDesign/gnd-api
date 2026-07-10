import paramiko

LOG = "/home/u967550282/api-node.log"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password="Ntds2026@", timeout=30)
cmds = [
    "grep MERCADOPAGO_COLLECTOR_ID ~/domains/slategray-manatee-407634.hostingersite.com/public_html/.builds/source/repository/.env",
    "ps aux | grep node | grep -v grep",
    f"tail -30 {LOG}",
    "curl -s http://127.0.0.1:3002/health",
]
for c in cmds:
    print(">>>", c)
    _, o, _ = ssh.exec_command(c, timeout=60)
    print(o.read().decode("utf-8", "replace"))
ssh.close()
