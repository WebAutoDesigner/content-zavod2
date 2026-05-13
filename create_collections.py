import urllib.request
import urllib.error
import json
import time

BASE = "http://85.239.59.252:8055"
TOKEN = "directus-mcp-2024-xK9m"

def api(method, path, data=None):
    req = urllib.request.Request(f"{BASE}{path}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if data:
        req.data = json.dumps(data).encode()
    req.method = method
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return True, json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return False, json.loads(body)
        except:
            return False, {"error": body.decode()[:300]}

def create_collection(name, singleton=False, icon="database", note=""):
    print(f"  Creating collection: {name}...")
    ok, res = api("POST", "/collections", {
        "collection": name,
        "schema": {},
        "meta": {"singleton": singleton, "icon": icon, "note": note}
    })
    if ok:
        print(f"    OK")
    else:
        err = res.get("errors", [{}])[0].get("message", str(res))
        if "already exists" in err.lower():
            print(f"    Already exists, skipping")
        else:
            print(f"    ERROR: {err}")
    return ok

def add_fields(collection, fields):
    for f in fields:
        fname = f["field"]
        ok, res = api("POST", f"/fields/{collection}", f)
        if ok:
            print(f"    + {fname}")
        else:
            err = res.get("errors", [{}])[0].get("message", str(res))
            if "already exists" in err.lower():
                print(f"    ~ {fname} (exists)")
            else:
                print(f"    ! {fname} ERROR: {err[:100]}")
        time.sleep(0.3)

def add_relation(collection, field, related_collection, on_delete="SET NULL"):
    ok, res = api("POST", "/relations", {
        "collection": collection,
        "field": field,
        "related_collection": related_collection,
        "schema": {"on_delete": on_delete},
        "meta": {}
    })
    if ok:
        print(f"    relation {collection}.{field} -> {related_collection} OK")
    else:
        err = res.get("errors", [{}])[0].get("message", str(res))
        if "already exists" in err.lower():
            print(f"    relation {field} exists")
        else:
            print(f"    relation {field} ERROR: {err[:100]}")

# ─────────────────────────────────────────────
print("\n=== 1. site_settings (singleton) ===")
create_collection("site_settings", singleton=True, icon="settings", note="Настройки студии")
add_fields("site_settings", [
    {"field": "name",             "type": "string", "meta": {"interface": "input", "note": "Название студии"}},
    {"field": "tagline",          "type": "string", "meta": {"interface": "input", "note": "Подзаголовок под названием"}},
    {"field": "phone",            "type": "string", "meta": {"interface": "input", "note": "Телефон: +7 (000) 000-00-00"}},
    {"field": "phone_href",       "type": "string", "meta": {"interface": "input", "note": "Ссылка: tel:+70000000000"}},
    {"field": "email",            "type": "string", "meta": {"interface": "input"}},
    {"field": "address",          "type": "string", "meta": {"interface": "input"}},
    {"field": "work_hours",       "type": "string", "meta": {"interface": "input", "note": "Пример: Пн–Вс: 9:00–20:00"}},
    {"field": "vk_url",           "type": "string", "meta": {"interface": "input", "note": "Ссылка ВКонтакте"}},
    {"field": "telegram_url",     "type": "string", "meta": {"interface": "input", "note": "Ссылка Telegram канал"}},
    {"field": "telegram_bot_url", "type": "string", "meta": {"interface": "input", "note": "Ссылка на бота для записи"}},
    {"field": "yandex_maps_embed","type": "text",   "meta": {"interface": "input-multiline", "note": "URL для iframe Яндекс карты"}},
    {"field": "cta_background",   "type": "uuid",   "meta": {"interface": "file-image", "special": ["file"], "note": "Фон CTA блока"}},
])

# ─────────────────────────────────────────────
print("\n=== 2. hero_slides ===")
create_collection("hero_slides", icon="slideshow", note="Слайды на главной странице")
add_fields("hero_slides", [
    {"field": "sort",     "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "title",    "type": "string",  "meta": {"interface": "input", "note": "Заголовок слайда"}},
    {"field": "subtitle", "type": "string",  "meta": {"interface": "input", "note": "Подзаголовок слайда"}},
    {"field": "image",    "type": "uuid",    "meta": {"interface": "file-image", "special": ["file"]}},
])

# ─────────────────────────────────────────────
print("\n=== 3. stats ===")
create_collection("stats", icon="bar_chart", note="Цифры: 10+ лет, 1000+ клиентов")
add_fields("stats", [
    {"field": "sort",  "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "value", "type": "string",  "meta": {"interface": "input", "note": "Число: '10+'"}},
    {"field": "label", "type": "string",  "meta": {"interface": "input", "note": "Подпись: 'лет опыта'"}},
])

# ─────────────────────────────────────────────
print("\n=== 4. reviews ===")
create_collection("reviews", icon="star", note="Отзывы клиентов")
add_fields("reviews", [
    {"field": "sort",           "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "name",           "type": "string",  "meta": {"interface": "input", "note": "Имя клиента"}},
    {"field": "text",           "type": "text",    "meta": {"interface": "input-multiline"}},
    {"field": "rating",         "type": "integer", "meta": {"interface": "slider", "options": {"minValue": 1, "maxValue": 5}}},
    {"field": "source",         "type": "string",  "meta": {"interface": "select-dropdown", "options": {"choices": [{"text": "Яндекс", "value": "yandex"}, {"text": "2GIS", "value": "2gis"}, {"text": "Google", "value": "google"}]}}},
    {"field": "avatar_initial", "type": "string",  "meta": {"interface": "input", "note": "Первая буква имени для аватара"}},
])

# ─────────────────────────────────────────────
print("\n=== 5. advantages ===")
create_collection("advantages", icon="workspace_premium", note="Преимущества студии")
add_fields("advantages", [
    {"field": "sort",        "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "title",       "type": "string",  "meta": {"interface": "input"}},
    {"field": "description", "type": "text",    "meta": {"interface": "input-multiline"}},
    {"field": "icon",        "type": "string",  "meta": {"interface": "input", "note": "Название иконки (crown, shield, diamond...)"}},
])

# ─────────────────────────────────────────────
print("\n=== 6. works ===")
create_collection("works", icon="photo_library", note="Галерея работ")
add_fields("works", [
    {"field": "sort",  "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "image", "type": "uuid",    "meta": {"interface": "file-image", "special": ["file"]}},
    {"field": "alt",   "type": "string",  "meta": {"interface": "input", "note": "Описание фото для SEO"}},
])

# ─────────────────────────────────────────────
print("\n=== 7. services ===")
create_collection("services", icon="build", note="Родительские услуги (8 страниц)")
add_fields("services", [
    {"field": "sort",        "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "slug",        "type": "string",  "meta": {"interface": "input", "note": "URL: okleika-plenkoy"}, "schema": {"is_unique": True}},
    {"field": "title",       "type": "string",  "meta": {"interface": "input"}},
    {"field": "description", "type": "text",    "meta": {"interface": "input-multiline"}},
    {"field": "image",       "type": "uuid",    "meta": {"interface": "file-image", "special": ["file"]}},
    {"field": "table_title", "type": "string",  "meta": {"interface": "input", "note": "Заголовок таблицы цен"}},
])

# ─────────────────────────────────────────────
print("\n=== 8. subservices ===")
create_collection("subservices", icon="handyman", note="Подуслуги (35 страниц)")
add_fields("subservices", [
    {"field": "sort",           "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "slug",           "type": "string",  "meta": {"interface": "input", "note": "URL: antigravijnaya-plenka"}, "schema": {"is_unique": True}},
    {"field": "title",          "type": "string",  "meta": {"interface": "input"}},
    {"field": "description",    "type": "text",    "meta": {"interface": "input-multiline"}},
    {"field": "image",          "type": "uuid",    "meta": {"interface": "file-image", "special": ["file"]}},
    {"field": "table_title",    "type": "string",  "meta": {"interface": "input", "note": "Заголовок таблицы цен"}},
    {"field": "parent_service", "type": "integer", "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"], "note": "Родительская услуга"}},
])
add_relation("subservices", "parent_service", "services")

# ─────────────────────────────────────────────
print("\n=== 9. price_rows ===")
create_collection("price_rows", icon="attach_money", note="Строки прайса (для услуг и подуслуг)")
add_fields("price_rows", [
    {"field": "sort",       "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "name",       "type": "string",  "meta": {"interface": "input", "note": "Название позиции"}},
    {"field": "price",      "type": "string",  "meta": {"interface": "input", "note": "Цена: 'от 5 000 ₽'"}},
    {"field": "service",    "type": "integer", "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"]}},
    {"field": "subservice", "type": "integer", "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"]}},
])
add_relation("price_rows", "service",    "services")
add_relation("price_rows", "subservice", "subservices")

# ─────────────────────────────────────────────
print("\n=== 10. faq_items ===")
create_collection("faq_items", icon="help", note="Вопросы и ответы")
add_fields("faq_items", [
    {"field": "sort",       "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "question",   "type": "string",  "meta": {"interface": "input"}},
    {"field": "answer",     "type": "text",    "meta": {"interface": "input-multiline"}},
    {"field": "service",    "type": "integer", "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"]}},
    {"field": "subservice", "type": "integer", "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"]}},
])
add_relation("faq_items", "service",    "services")
add_relation("faq_items", "subservice", "subservices")

# ─────────────────────────────────────────────
print("\n=== 11. content_blocks ===")
create_collection("content_blocks", icon="article", note="Текстовые блоки (h2 + абзац)")
add_fields("content_blocks", [
    {"field": "sort",       "type": "integer", "meta": {"interface": "input", "hidden": True}, "schema": {}},
    {"field": "heading",    "type": "string",  "meta": {"interface": "input", "note": "Заголовок h2"}},
    {"field": "text",       "type": "text",    "meta": {"interface": "input-multiline"}},
    {"field": "service",    "type": "integer", "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"]}},
    {"field": "subservice", "type": "integer", "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"]}},
])
add_relation("content_blocks", "service",    "services")
add_relation("content_blocks", "subservice", "subservices")

# ─────────────────────────────────────────────
print("\n=== O2M aliases на services и subservices ===")
# O2M fields on services
add_fields("services", [
    {"field": "subservices",    "type": "alias", "meta": {"interface": "list-o2m", "special": ["o2m"]}},
    {"field": "price_rows",     "type": "alias", "meta": {"interface": "list-o2m", "special": ["o2m"]}},
    {"field": "faq_items",      "type": "alias", "meta": {"interface": "list-o2m", "special": ["o2m"]}},
    {"field": "content_blocks", "type": "alias", "meta": {"interface": "list-o2m", "special": ["o2m"]}},
])
# O2M fields on subservices
add_fields("subservices", [
    {"field": "price_rows",     "type": "alias", "meta": {"interface": "list-o2m", "special": ["o2m"]}},
    {"field": "faq_items",      "type": "alias", "meta": {"interface": "list-o2m", "special": ["o2m"]}},
    {"field": "content_blocks", "type": "alias", "meta": {"interface": "list-o2m", "special": ["o2m"]}},
])

# Relations for O2M
print("  O2M relations...")
add_relation("services", "subservices",    "subservices",    on_delete="SET NULL")
add_relation("services", "price_rows",     "price_rows",     on_delete="SET NULL")
add_relation("services", "faq_items",      "faq_items",      on_delete="SET NULL")
add_relation("services", "content_blocks", "content_blocks", on_delete="SET NULL")
add_relation("subservices", "price_rows",     "price_rows",     on_delete="SET NULL")
add_relation("subservices", "faq_items",      "faq_items",      on_delete="SET NULL")
add_relation("subservices", "content_blocks", "content_blocks", on_delete="SET NULL")

print("\n=== DONE ===")
