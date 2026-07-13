#!/usr/bin/env python3
"""Apply DB_HOST=127.0.0.1 fix and probe pool. Password via env only."""
import os
import sys

import paramiko

HOST, PORT, USER = "82.25.67.184", 65002, "u967550282"
PASSWORD = os.environ.get("HOSTINGER_SSH_PASSWORD") or (sys.argv[1] if len(sys.argv) > 1 else "")
RUNTIME = "/home/u967550282/domains/api.naturalonline.com.ar/nodejs"
BUILDS = "/home/u967550282/domains/api.naturalonline.com.ar/public_html/.builds/config/.env"


def run(ssh, cmd, timeout=60):
    print(f"\n>>> {cmd[:160]}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write((out + ("\n" + err if err.strip() else "") + f"\n[exit {code}]\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()
    return code, out


def main() -> int:
    if not PASSWORD:
        print("Need HOSTINGER_SSH_PASSWORD or argv password", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)

    for path in (f"{RUNTIME}/.env", BUILDS):
        run(
            ssh,
            f"test -f {path} && sed -i 's/^DB_HOST=.*/DB_HOST=127.0.0.1/' {path} && grep '^DB_HOST=' {path} || echo missing:{path}",
        )

    probe = r"""
require('dotenv').config({path:'.env', override:true});
const mariadb = require('mariadb');
(async () => {
  console.log('DB_HOST=', process.env.DB_HOST);
  const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT)||3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 2,
    connectTimeout: 10000,
    acquireTimeout: 10000,
    allowPublicKeyRetrieval: true,
  });
  try {
    const conn = await pool.getConnection();
    const rows = await conn.query('SELECT 1 AS ok, DATABASE() AS db');
    console.log('pool_ok', JSON.stringify(rows));
    conn.release();
  } catch (e) {
    console.error('pool_fail', e.message || String(e));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
"""
    sftp = ssh.open_sftp()
    remote = f"{RUNTIME}/_tmp_db_probe.js"
    with sftp.file(remote, "w") as f:
        f.write(probe)
    sftp.close()

    code, _ = run(
        ssh,
        f"source /opt/alt/alt-nodejs20/enable 2>/dev/null; cd {RUNTIME} && node _tmp_db_probe.js; rm -f _tmp_db_probe.js",
        timeout=45,
    )
    ssh.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
