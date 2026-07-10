import paramiko

HOST, PORT, USER, PASSWORD = "82.25.67.184", 65002, "u967550282", "Ntds2026@"
DOMAIN = "/home/u967550282/domains/slategray-manatee-407634.hostingersite.com"
GND_API = f"{DOMAIN}/gnd-api"
BUILDS = f"{DOMAIN}/public_html/.builds"
REPO = f"{BUILDS}/source/repository"
ENV_LOCAL = r"D:\Adobe\Hard Work\Proyectos\GND\gnd\api\hostinger.env"


def run(ssh, cmd, timeout=600):
    print(">>>", cmd)
    _, o, e = ssh.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    print(f"[exit {code}]")
    return code


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
sftp = ssh.open_sftp()

# Replace deployed repository with built gnd-api
run(ssh, f"rm -rf {REPO}.altiplano.bak && mv {REPO} {REPO}.altiplano.bak 2>/dev/null; true")
run(ssh, f"cp -a {GND_API} {REPO}")
run(ssh, f"head -8 {REPO}/package.json && ls -la {REPO}/dist/index.js")

# Runtime env used by Hostinger Node process
print(f">>> upload env -> {BUILDS}/config/.env")
sftp.put(ENV_LOCAL, f"{BUILDS}/config/.env")

# Also keep .env in repository root for dotenv at runtime
sftp.put(ENV_LOCAL, f"{REPO}/.env")

run(ssh, f"grep '^DB_HOST=' {BUILDS}/config/.env && grep '^NODE_ENV=' {BUILDS}/config/.env")

sftp.close()
ssh.close()
print("Runtime files updated.")
