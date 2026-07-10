import paramiko

LOG = "/home/u967550282/domains/slategray-manatee-407634.hostingersite.com/public_html/.builds/logs/019e739f-24f9-728e-ae3b-5dcc23cc8c8e/2026-05-29_12-04-38_deploy.log"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password="Ntds2026@", timeout=30)
_, o, _ = ssh.exec_command(f"tail -50 {LOG}", timeout=30)
print(o.read().decode("utf-8", "replace"))
ssh.close()
