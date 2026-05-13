import urllib.request
import urllib.error
import json

BASE = "http://85.239.59.252:8055"

def api(method, path, data=None, token=None):
    req = urllib.request.Request(f"{BASE}{path}")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if data:
        req.data = json.dumps(data).encode()
    req.method = method
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

# Login
print("Logging in...")
res = api("POST", "/auth/login", {"email": "admin@admin.com", "password": "Admin123!"})
print("Login:", json.dumps(res, indent=2)[:300])
access_token = res["data"]["access_token"]

# Get admin user ID
res = api("GET", "/users/me", token=access_token)
user_id = res["data"]["id"]
print(f"Admin ID: {user_id}")

# Set static token
STATIC_TOKEN = "directus-mcp-2024-xK9m"
res = api("PATCH", f"/users/{user_id}", {"token": STATIC_TOKEN}, token=access_token)
print("Token set:", "ok" if "data" in res else res)

# Verify
res = api("GET", "/server/ping", token=STATIC_TOKEN)
print("Verify:", res)

print(f"\n{'='*50}")
print("URL:   http://85.239.59.252:8055")
print(f"Login: admin@admin.com / Admin123!")
print(f"Token: {STATIC_TOKEN}")
print(f"{'='*50}")
