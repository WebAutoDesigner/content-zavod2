import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('85.239.59.252', username='root', password='oodFNE-XAMK28z', timeout=60, banner_timeout=60, auth_timeout=60)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    return code, out, err

print("=== Docker disk usage ===")
code, out, err = run('docker system df')
print(out)

print("=== Docker images ===")
code, out, err = run('docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}"')
print(out)

print("=== Running containers ===")
code, out, err = run('docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
print(out)

print("=== Disk by top dirs ===")
code, out, err = run('du -sh /var /root /home /tmp 2>/dev/null')
print(out)

client.close()
