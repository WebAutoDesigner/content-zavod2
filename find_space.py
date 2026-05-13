import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('85.239.59.252', username='root', password='oodFNE-XAMK28z', timeout=60, banner_timeout=60, auth_timeout=60)

def run(cmd, timeout=15):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err

# Docker container logs are the classic culprit
out, err = run('ls -lah /var/lib/docker/containers/*/  2>/dev/null | grep "json.log"', timeout=10)
print("=== Docker json.log files ===\n", out or err[:200])

# Check /var/log specifically
out, err = run('ls -lSh /var/log/ 2>/dev/null | head -15', timeout=10)
print("=== /var/log sorted by size ===\n", out)

# Check lsof for deleted large files
out, err = run('lsof | grep deleted | awk \'{print $7, $1, $NF}\' | sort -rh | head -10', timeout=12)
print("=== Deleted but open files ===\n", out or "none")

client.close()
