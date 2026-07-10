import paramiko

REPO = "/home/u967550282/domains/slategray-manatee-407634.hostingersite.com/public_html/.builds/source/repository"
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("82.25.67.184", port=65002, username="u967550282", password="Ntds2026@", timeout=30)
cmd = (
    f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; cd {REPO}; "
    "node -e \"require('dotenv').config();const {{PrismaClient}}=require('@prisma/client');"
    "const {{PrismaMariaDb}}=require('@prisma/adapter-mariadb');"
    "const a=new PrismaMariaDb({host:process.env.DB_HOST,user:process.env.DB_USER,"
    "password:process.env.DB_PASS,database:process.env.DB_NAME,port:Number(process.env.DB_PORT||3306)});"
    "const p=new PrismaClient({adapter:a});p.\\$queryRaw\\`SELECT 1 as ok\\`.then(r=>{console.log(JSON.stringify({db:'connected',r}));process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)});\""
)
print(">>> db test")
_, o, e = ssh.exec_command(cmd, timeout=60)
print(o.read().decode("utf-8", "replace"))
print(e.read().decode("utf-8", "replace"))
ssh.close()
