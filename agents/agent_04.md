# agent_04 — Производство (WF04)

Ты субагент контент-завода. Твоя задача — реализовать n8n workflow **WF04 Производство** (ID: `DB6h9VuJPhCS5EEq`).

**ВАЖНО:** Все ноды в WF04 сейчас noOp — нужно построить с нуля. Структура и соединения уже правильные, замени noOp на рабочие ноды.

У тебя есть доступ к инструментам n8n MCP — используй их.

---

## ЧТО ДЕЛАЕТ WF04

Вызывается из WF03.5 (executeWorkflow) для каждой идеи отдельно:
1. Получает от 03.5: `idea_id`, `format` (reel_c/b/a/d), `hook`, `topic`, `product`, `visual_ref`, `sound_ref`
2. Читает из Supabase T5 (звуковой паттерн по sound_ref) и T6 (визуальный паттерн по visual_ref)
3. GPT-4o генерирует текст + параметры рендера по формату
4. Jamendo API подбирает трек по настройкам из T5
5. Switch по `format` → одна из 4 веток рендеринга
6. Merge → QC → Moderation → сохранение в T2 со статусом `ready`

**Порядок форматов по приоритету:** C → A → B → D

---

## ИНФРАСТРУКТУРА

**Supabase — HTTP Request (не Supabase-нода):**
- Base URL: `https://jlenlqhudcgkmnxnkguk.supabase.co`
- Headers (на каждый запрос):
  - `apikey: SUPABASE_KEY_PLACEHOLDER`
  - `Authorization: Bearer SUPABASE_KEY_PLACEHOLDER`
  - `Content-Type: application/json`

**Таблицы:**
- T2 `my_content` — PATCH в конце (status, file_path, caption, hashtags)
- T5 `sound_patterns` — GET по id → поля: `bpm` (одно значение), `mood`, `genre`
- T6 `visual_patterns` — GET по id → поля: `bg_colors` (строка с цветами), `style_type`, `layout`

**LLM — polza.ai:**
- URL: `https://polza.ai/api/v1/chat/completions`
- Key: `POLZA_AI_KEY`
- Модели:
  - `openai/gpt-4o` — основная генерация текста и параметров рендера
  - `google/gemini-2.5-flash-lite` — черновик диалога (формат B), контент-проверка (шаг 9)
  - `qwen/qwen3-8b` — перевод RU→EN (формат D)

**Jamendo API:**
- URL: `https://api.jamendo.com/v3.0/tracks/`
- Params: `client_id=e118f1aa`, `format=json`, `limit=1`, `audioformat=mp3`
- Фильтры из T5: `bpmgreater={{ Math.max(60, (T5.bpm||100)-20) }}`, `bpmlesser={{ (T5.bpm||100)+20 }}`, `tags={{T5.mood}}`
- Из ответа взять `audio` (прямая ссылка на mp3) и `id`
- Скачать трек (HTTP Request бинарный) → сохранить `/opt/content/audio/{{id}}.mp3`
- Если файл уже существует — использовать кэш (проверить через Code ноду `fs.existsSync`)

**FFmpeg рендер-сервер (локально на сервере):**
- POST `http://localhost:8003/render` — рендеринг видео
- POST `http://localhost:8003/add_hook_and_music` — добавить хук + музыку
- Все видео: `1080x1920`, ≤15 сек, выходной путь: `/opt/content/video/`

**Playwright рендер-сервер — только формат B:**
- POST `http://localhost:8004/render_chat`

**fal.ai и ElevenLabs — только формат D:**
- Оставь ветку D как noOp, сообщи лиду что нужны ключи

---

## ЧТО НУЖНО ПОСТРОИТЬ (пошагово)

### Шаг 1 — Trigger
- Тип: `n8n-nodes-base.executeWorkflowTrigger`
- Входные данные от WF03.5 доступны как `$json` (idea_id, format, hook, topic, product, visual_ref, sound_ref)

---

### Шаг 2 — Читать T5, затем T6 (последовательно)

**Важно:** в n8n от одного выхода нельзя честно разветвить параллельно. Делай последовательно: T5 → T6 → дальше.

**Нода "Supabase T5: звуковой паттерн"**
- Тип: HTTP Request
- Method: GET
- URL: `https://jlenlqhudcgkmnxnkguk.supabase.co/rest/v1/sound_patterns?id=eq.{{$('📨 Trigger от 03.5').item.json.sound_ref}}&select=bpm,mood,genre`

**Нода "Supabase T6: визуальный паттерн"**
- Тип: HTTP Request
- Method: GET
- URL: `https://jlenlqhudcgkmnxnkguk.supabase.co/rest/v1/visual_patterns?id=eq.{{$('📨 Trigger от 03.5').item.json.visual_ref}}&select=bg_colors,style_type,layout`

**Нода "Code: подготовить данные"** (после T6)
Объединяет данные тригера, T5 и T6 в один объект. Добавляет дефолты если T5/T6 пустые:
```js
const trigger = $('📨 Trigger от 03.5').item.json;
const t5 = $('Supabase T5: звуковой паттерн').item.json[0] || {};
const t6raw = $('Supabase T6: визуальный паттерн').item.json;
const t6 = (t6raw && t6raw.length > 0) ? t6raw[0] : {
  bg_colors: '#0d0d0d',
  style_type: 'minimal',
  layout: 'center'
};

const bpm = t5.bpm || 100;
return [{json: {
  idea_id: trigger.idea_id,
  format: trigger.format,
  hook: trigger.hook,
  topic: trigger.topic,
  product: trigger.product,
  t5_bpm_min: Math.max(60, bpm - 20),
  t5_bpm_max: bpm + 20,
  t5_mood: t5.mood || 'motivational',
  t5_genre: t5.genre || 'electronic',
  t6_bg_color: (t6.bg_colors || '#0d0d0d').split(',')[0].trim(),
  t6_style: t6.style_type || 'minimal',
  t6_layout: t6.layout || 'center'
}}];
```

---

### Шаг 3 — GPT-4o: генерация текста и параметров рендера

HTTP Request к polza.ai. Тело запроса:
```json
{
  "model": "openai/gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "Ты копирайтер Instagram-канала «Бизнес на автопилоте». Аудитория: владельцы малого бизнеса РФ 25-45 лет (салоны, рестораны, магазины). Отвечай ТОЛЬКО валидным JSON без markdown."
    },
    {
      "role": "user",
      "content": "Формат: {{format}}\nХук: {{hook}}\nТема: {{topic}}\nПродукт: {{product}}\nВизуал цвет фона: {{t6_bg_color}}\n\nСгенерируй JSON:\n{\n  \"caption\": \"подпись к посту до 150 символов на русском\",\n  \"hook_text\": \"хук до 8 слов на русском, бьёт в боль\",\n  \"hashtags\": \"5-7 хэштегов через пробел\",\n  \"pains\": [\"боль 1\", \"боль 2\", \"боль 3\"],\n  \"solution\": \"как {{product}} решает боль, 1 предложение\",\n  \"business_name\": \"название условного бизнеса клиента (для формата A)\",\n  \"metrics\": [{\"label\": \"...\", \"value\": \"...\", \"unit\": \"...\"}, {\"label\": \"...\", \"value\": \"...\", \"unit\": \"...\"}, {\"label\": \"...\", \"value\": \"...\", \"unit\": \"...\"}],\n  \"tagline\": \"короткий слоган бизнеса (для формата A)\"\n}"
    }
  ],
  "temperature": 0.8
}
```

После получения ответа — Code нода для парсинга JSON из `choices[0].message.content`.

---

### Шаг 4 — Jamendo API: подбор трека

**Нода "Jamendo: поиск трека"**
- Method: GET
- URL: `https://api.jamendo.com/v3.0/tracks/`
- Params: `client_id=e118f1aa`, `format=json`, `limit=1`, `audioformat=mp3`, `bpmgreater={{t5_bpm_min}}`, `bpmlesser={{t5_bpm_max}}`, `tags={{t5_mood}}`

**Нода "Code: скачать или взять из кэша"**
```js
const tracks = $json.results;
if (!tracks || tracks.length === 0) {
  throw new Error('Jamendo: треки не найдены для mood=' + $json.t5_mood);
}
const track = tracks[0];
const audioPath = `/opt/content/audio/${track.id}.mp3`;
const fs = require('fs');
// Если файл уже есть — используем кэш
const needDownload = !fs.existsSync(audioPath);
return [{json: {...$json, jamendo_url: track.audio, jamendo_path: audioPath, jamendo_need_download: needDownload}}];
```

**Нода "IF: нужно скачать?"** → если true → HTTP Request (бинарный, GET на jamendo_url) → Write Binary File в jamendo_path

---

### Шаг 5 — Switch по format
- Тип: `n8n-nodes-base.switch`
- Mode: `rules`
- Rules:
  - Output 0: `{{ $json.format }}` equals `reel_c`
  - Output 1: `{{ $json.format }}` equals `reel_b`
  - Output 2: `{{ $json.format }}` equals `reel_a`
  - Output 3: `{{ $json.format }}` equals `reel_d`
- Fallback output: 0 (дефолт — ветка C)

---

### Шаг 6 — Ветки форматов

#### Ветка C — Typewriter / боль → решение (делай ПЕРВОЙ)

HTTP Request POST `http://localhost:8003/render`:
```json
{
  "type": "typewriter",
  "hook": "{{ $json.hook_text }}",
  "texts": "{{ $json.pains }}",
  "solution": "{{ $json.solution }}",
  "bg_color": "{{ $json.t6_bg_color }}",
  "font": "{{ $json.t6_font }}",
  "audio_path": "{{ $json.jamendo_path }}",
  "resolution": "1080x1920",
  "duration": 15
}
```
Из ответа взять `file_path`. Передать дальше: `{...все поля, file_path}`.

---

#### Ветка A — Карточка результата (делай ВТОРОЙ)

HTTP Request POST `http://localhost:8003/render`:
```json
{
  "type": "result_card",
  "business_name": "{{ $json.business_name }}",
  "metrics": "{{ $json.metrics }}",
  "tagline": "{{ $json.tagline }}",
  "bg_color": "{{ $json.t6_bg_color }}",
  "font": "{{ $json.t6_font }}",
  "animation": "count_up",
  "audio_path": "{{ $json.jamendo_path }}",
  "resolution": "1080x1920",
  "duration": 15
}
```

---

#### Ветка B — Чат-симуляция (делай ТРЕТЬЕЙ)

**Шаг B1 — Gemini Flash: черновик диалога**
HTTP Request к polza.ai, model: `google/gemini-2.5-flash-lite`:
```
System: "Ты пишешь сценарий чат-переписки для Instagram Reel. Отвечай ТОЛЬКО валидным JSON."
User: "Тема: {{topic}}\nПродукт: {{product}}\nЧеловек пишет в Telegram-бот бизнеса, бот отвечает. 6 реплик: 3 от клиента, 3 от бота. Клиент — владелец малого бизнеса, у него проблема. Бот решает её. Финальная реплика клиента — позитивная реакция.\n\nJSON:\n{\"messages\": [{\"sender\": \"client|bot\", \"text\": \"...\"}]}"
```

**Шаг B2 — GPT-4o: финализировать диалог**
Передать черновик из B1, попросить улучшить естественность и добавить эмодзи боту.

**Шаг B3 — Playwright рендер**
POST `http://localhost:8004/render_chat`:
```json
{"messages": "{{messages из B2}}", "theme": "dark", "duration": 12}
```

**Шаг B4 — Добавить хук и музыку**
POST `http://localhost:8003/add_hook_and_music`:
```json
{"video_path": "{{из B3}}", "hook": "{{hook_text}}", "audio_path": "{{jamendo_path}}", "drop_sec": 1}
```

---

#### Ветка D — AI видео (оставь noOp)
Вставь noOp с заметкой: `"Ждёт ключей fal.ai и ElevenLabs от пользователя"`

---

### Шаг 7 — Merge
- Тип: `n8n-nodes-base.merge`
- Mode: `combineAll`
- Все 4 ветки входят сюда

---

### Шаг 8 — QC: проверка файла

Code нода:
```js
const filePath = $json.file_path;
if (!filePath) {
  throw new Error(`QC failed: file_path пустой. format=${$json.format}, idea_id=${$json.idea_id}`);
}
const fs = require('fs');
if (!fs.existsSync(filePath)) {
  throw new Error(`QC failed: файл не существует: ${filePath}`);
}
return [{json: $json}];
```

---

### Шаг 9 — Контент-проверка (через Gemini Flash, НЕ OpenAI Moderation)

HTTP Request к polza.ai, model: `google/gemini-2.5-flash-lite`:
```
System: "Ты модератор. Отвечай ТОЛЬКО JSON: {\"safe\": true/false, \"reason\": \"...\"}"
User: "Проверь текст на запрещённый контент (насилие, 18+, политика, мошенничество):\n{{caption}} {{hook_text}}"
```

Code нода после: если `safe === false` → `throw new Error('Moderation: ' + reason)`.

---

### Шаг 10 — Сохранить в T2

HTTP Request:
- Method: PATCH
- URL: `https://jlenlqhudcgkmnxnkguk.supabase.co/rest/v1/my_content?id=eq.{{idea_id}}`
- Headers: Prefer: `return=minimal`
- Body:
```json
{
  "status": "ready",
  "file_path": "{{ $json.file_path }}",
  "caption": "{{ $json.caption }}",
  "hashtags": "{{ $json.hashtags }}"
}
```

---

## КАК РАБОТАТЬ

⚠️ **КРИТИЧЕСКИ ВАЖНО — ЗАПРЕЩЕНО:**
- **НИКОГДА не используй `n8n_update_workflow`** (полный PUT) — он затирает все ноды которые ты не включил в список. Это уже сломало workflow один раз.
- **ВСЕГДА используй только `n8n_update_partial_workflow`** с точечными операциями: addNode, updateNode, addConnection, removeConnection.

**Порядок работы:**
1. Прочитай текущий workflow: `n8n_get_workflow` (ID: `DB6h9VuJPhCS5EEq`) — запомни все существующие ноды
2. Добавляй/изменяй ноды по одной через `n8n_update_partial_workflow`
3. После каждого изменения убедись что оно сохранилось (смотри на ответ — success: true)
4. Если `localhost:8003` или `:8004` не отвечают — сообщи лиду, **не пытайся запустить тест**
5. Ветку D оставь noOp — нужны внешние ключи

---

## ЧТО НЕ ТРОГАТЬ

- Другие workflows (WF01, WF02, WF03, WF03.5, WF05, WF06)
- Ветку D — оставь noOp

---

## ОБЯЗАТЕЛЬНО: Webhook для ручного тестирования

После реализации всех нод — добавь **Webhook триггер** параллельно основному триггеру:
- Тип: Webhook (HTTP Method: POST, Path: `wf04-trigger`)
- Подключи к той же первой ноде что и основной триггер
- Это позволяет запускать workflow вручную через `POST http://85.239.59.252:5678/webhook/wf04-trigger`

---

## КАК ОТЧИТАТЬСЯ ЛИДУ

1. Какие ноды реализованы (было noOp → стало реальной нодой)
2. Статус каждой ветки: C / A / B / D
3. Результат последнего сохранения (успех/ошибка)
4. Что нужно от пользователя: ключи fal.ai + ElevenLabs, статус серверов :8003 и :8004
5. Готов ли workflow к тестовому запуску с тестовыми данными
