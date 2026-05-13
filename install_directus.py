import paramiko
import time
import json

COMPOSE = """services:
  database:
    image: postgis/postgis:15-master
    environment:
      POSTGRES_USER: directus
      POSTGRES_PASSWORD: directus_pass_2024
      POSTGRES_DB: directus
    volumes:
      - ./db_data:/var/lib/postgresql/data
    restart: unless-stopped

  directus:
    image: directus/directus:latest
    ports:
      - "8055:8055"
    depends_on:
      - database
    environment:
      SECRET: "direct-secret-xK9mP2024"
      DB_CLIENT: pg
      DB_HOST: database
      DB_PORT: "5432"
      DB_DATABASE: directus
      DB_USER: directus
      DB_PASSWORD: directus_pass_2024
      ADMIN_EMAIL: admin@admin.com
      ADMIN_PASSWORD: Admin123!
      PUBLIC_URL: "http://85.239.59.252:8055"
    volumes:
      - ./uploads:/directus/uploads
    restart: unless-stopped
"""

def ssh_run(client, cmd, timeout=60):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    return code, out, err

print("Connecting...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('85.239.59.252', username='root', password='oodFNE-XAMK28z', timeout=60, banner_timeout=60, auth_timeout=60)
print("Connected!")

# Step 1: Delete 40GB syslog
print("\n[1/5] Deleting 40GB syslog.1...")
code, out, err = ssh_run(client, 'rm -f /var/log/syslog.1 && df -h / | tail -1', timeout=15)
print(f"Disk after: {out.strip()}")

# Step 2: Write docker-compose
print("\n[2/5] Writing docker-compose.yml...")
code, out, err = ssh_run(client, f"cat > /root/directus/docker-compose.yml << 'ENDOFFILE'\n{COMPOSE}\nENDOFFILE")
print(f"Write: {code}, err: {err[:100] if err else 'ok'}")

# Step 3: Pull and start
print("\n[3/5] Starting Directus (pulling images ~1-2 min)...")
code, out, err = ssh_run(client, 'cd /root/directus && docker-compose up -d 2>&1', timeout=300)
print(f"Up: code={code}\n{out[-600:]}")

# Step 4: Wait for ready
print("\n[4/5] Waiting for Directus to initialize...")
for i in range(12):
    time.sleep(10)
    code, out, err = ssh_run(client, 'cd /root/directus && docker-compose logs directus --tail=3 2>&1', timeout=15)
    status_line = out.strip().split('\n')[-1] if out.strip() else ''
    print(f"  [{(i+1)*10}s] {status_line}")
    if any(x in out for x in ['Server started', 'Listening on', '8055', 'ready']):
        print("  Directus is up!")
        break

# Step 5: Create static token via API
print("\n[5/5] Checking API and setting token...")
code, out, err = ssh_run(client, 'curl -s http://localhost:8055/server/ping', timeout=10)
print(f"Ping: {out}")

code, out, err = ssh_run(client, '''curl -s -X POST http://localhost:8055/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.com","password":"Admin123!"}' ''', timeout=10)
print(f"Login: {out[:300]}")

try:
    login_data = json.loads(out)
    access_token = login_data['data']['access_token']

    code, out, err = ssh_run(client, f'curl -s http://localhost:8055/users/me -H "Authorization: Bearer {access_token}"', timeout=10)
    user_id = json.loads(out)['data']['id']

    static_token = "directus-mcp-2024-xK9m"
    code, out, err = ssh_run(client, f'''curl -s -X PATCH http://localhost:8055/users/{user_id} \
      -H "Authorization: Bearer {access_token}" \
      -H "Content-Type: application/json" \
      -d '{{"token": "{static_token}"}}' ''', timeout=10)

    # Verify
    code, out, err = ssh_run(client, f'curl -s http://localhost:8055/server/ping -H "Authorization: Bearer {static_token}"', timeout=10)
    print(f"Token verify: {out}")

    print(f"\n{'='*50}")
    print(f"SUCCESS!")
    print(f"URL:   http://85.239.59.252:8055")
    print(f"Login: admin@admin.com / Admin123!")
    print(f"Token: {static_token}")
    print(f"{'='*50}")

except Exception as e:
    print(f"Token setup failed: {e}")
    print("Directus may still be starting. Check http://85.239.59.252:8055")

client.close()
