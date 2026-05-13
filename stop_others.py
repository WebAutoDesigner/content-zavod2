import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('85.239.59.252', username='root', password='oodFNE-XAMK28z', timeout=60, banner_timeout=60, auth_timeout=60)

def run(cmd, timeout=20):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err

# Stop n8n
out, err = run('docker stop n8n')
print("Stop n8n:", out.strip() or err.strip())

# Stop only FFmpeg via pm2 (keep playwright)
out, err = run('pm2 stop ffmpeg-server 2>/dev/null || pm2 list | grep -i ffmpeg | awk \'{print $2}\' | xargs pm2 stop 2>/dev/null || echo "ffmpeg not found in pm2"')
print("pm2 stop ffmpeg:", out.strip() or err[:100])

# Check memory after
out, err = run('free -m | grep Mem')
print("Memory:", out.strip())

out, err = run('docker ps --format "{{.Names}}\t{{.Status}}"')
print("Running:", out.strip())

client.close()
