import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('85.239.59.252', username='root', password='oodFNE-XAMK28z', timeout=60, banner_timeout=60, auth_timeout=60)

def run(cmd, timeout=15):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err

# Check firewall status
out, err = run('ufw status')
print("UFW:", out)

out, err = run('iptables -L INPUT -n --line-numbers | head -20')
print("iptables:", out)

# Check if container is running and port is bound
out, err = run('docker ps --format "{{.Names}}\t{{.Ports}}"')
print("Containers:", out)

# Open port 8055
out, err = run('ufw allow 8055/tcp')
print("ufw allow 8055:", out, err)

out, err = run('ufw status')
print("UFW after:", out)

client.close()
