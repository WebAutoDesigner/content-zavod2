import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('85.239.59.252', username='root', password='oodFNE-XAMK28z', timeout=30)

cmd = 'docker ps && echo "DISK:" && df -h / | tail -2'
stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
code = stdout.channel.recv_exit_status()
client.close()

print('EXIT:', code)
print('STDOUT:')
print(out)
if err:
    print('STDERR:', err)
