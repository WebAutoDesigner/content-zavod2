import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('85.239.59.252', username='root', password='oodFNE-XAMK28z', timeout=60, banner_timeout=60, auth_timeout=60)

def run(cmd, timeout=15):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err

out, err = run('docker ps --format "{{.Names}}\t{{.Status}}"')
print("Containers:", out)

out, err = run('docker logs directus_directus_1 2>&1 | tail -15')
print("Directus logs:", out or err[:300])

out, err = run('free -m | tail -2')
print("Memory:", out)

client.close()
