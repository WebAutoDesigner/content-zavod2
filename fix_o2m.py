import urllib.request, json, time

BASE = "http://85.239.59.252:8055"
TOKEN = "directus-mcp-2024-xK9m"

def api(method, path, data=None):
    req = urllib.request.Request(f"{BASE}{path}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if data: req.data = json.dumps(data).encode()
    req.method = method
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return True, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return False, json.loads(e.read())
        except: return False, {}

# Read all relations
ok, res = api("GET", "/relations")
relations = res.get("data", [])

# Map: (many_collection, many_field) -> relation id
rel_map = {}
for r in relations:
    key = (r["collection"], r["field"])
    rel_map[key] = r

# O2M wiring: (many_collection, many_field, one_collection, one_field)
wires = [
    ("subservices",    "parent_service", "services",    "subservices"),
    ("price_rows",     "service",        "services",    "price_rows"),
    ("faq_items",      "service",        "services",    "faq_items"),
    ("content_blocks", "service",        "services",    "content_blocks"),
    ("price_rows",     "subservice",     "subservices", "price_rows"),
    ("faq_items",      "subservice",     "subservices", "faq_items"),
    ("content_blocks", "subservice",     "subservices", "content_blocks"),
]

for many_col, many_field, one_col, one_field in wires:
    rel = rel_map.get((many_col, many_field))
    if not rel:
        print(f"  NOT FOUND: {many_col}.{many_field}")
        continue
    ok, res = api("PATCH", f"/relations/{many_col}/{many_field}", {
        "meta": {
            "one_collection": one_col,
            "one_field": one_field,
            "many_collection": many_col,
            "many_field": many_field,
        }
    })
    if ok:
        print(f"  OK: {many_col}.{many_field} <-> {one_col}.{one_field}")
    else:
        print(f"  ERR: {many_col}.{many_field}: {res.get('errors',[{}])[0].get('message','')[:80]}")
    time.sleep(0.3)

print("\nDone!")
