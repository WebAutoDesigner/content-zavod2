# agent_03_5 — Оценка и Отбор (WF03.5)

Ты субагент контент-завода. Твоя задача — настроить n8n workflow **WF03.5 Оценка** (ID: `9nY3DElCbXAObqCd`) так, чтобы он работал от начала до конца.

У тебя есть доступ к инструментам n8n MCP — используй их.

---

## ЧТО ДЕЛАЕТ WF03.5

Запускается после WF03 через `executeWorkflow`. Получает 15 идей на вход.

1. Принимает 15 идей от WF03 (через Execute Workflow Trigger)
2. LLM оценивает каждую по 5 критериям (0–10), итого скор 0–50
3. Сортирует и выбирает топ-3: строго 1 Reel + 1 Post + 1 Story
4. Проверяет тексты через OpenAI Moderation API (бесплатно)
5. Сохраняет топ-3 в `my_content` (T2) со статусом `queued`
6. Запускает WF04 Производство (noOp пока, просто добавь ноду)

---

## ИНФРАСТРУКТУРА

**Supabase — через HTTP Request (не Supabase-нода):**
- URL: `https://jlenlqhudcgkmnxnkguk.supabase.co`
- apikey: `SUPABASE_KEY_PLACEHOLDER`
- Authorization: `Bearer SUPABASE_KEY_PLACEHOLDER`

**LLM — polza.ai:**
- URL: `https://polza.ai/api/v1/chat/completions`
- Key: `POLZA_AI_KEY`
- Model: `google/gemini-2.5-flash-lite` (для скоринга) или `openai/gpt-4o`
- POST, body: `{"model": "...", "messages": [...], "temperature": 0.1}`

**OpenAI Moderation API (бесплатный, ключ не нужен для базовой версии):**
- URL: `https://api.openai.com/v1/moderations`
- Если нет OpenAI ключа — пропусти этот шаг, добавь заглушку-Code ноду которая просто передаёт данные дальше

**Таблицы:**
- T2 `my_content` — назначение: INSERT топ-3 идей со статусом `queued`

---

## СТРУКТУРА WORKFLOW

Ноды которые нужно реализовать (сейчас все noOp):

1. **📨 Execute Workflow Trigger** — получает данные от WF03
   - Тип: `n8n-nodes-base.executeWorkflowTrigger`
   - Входные данные: массив 15 идей

2. **🤖 LLM скоринг** — HTTP POST к polza.ai
   - Промт (системный): оцени каждую из 15 идей по 5 критериям 0–10. Верни JSON массив с полями: `format, hook, topic, product, visual_style, sound_mood, scores: {hook_strength, pattern_match, virality, product_relevance, uniqueness, total}`

3. **📋 Parse + Sort** — Code нода
   - Парсит JSON от LLM
   - Сортирует по total DESC
   - Выбирает топ-3: лучший Reel + лучший Post + лучший Story
   - Проверяет что топ-3 из разных ниш (если нет — берёт следующего)

4. **🛡 Moderation check** — HTTP POST к OpenAI Moderation (или Code-заглушка)
   - Если флаг `flagged: true` — заменяем следующей идеей из sorted списка

5. **💾 INSERT T2 my_content** — HTTP POST к Supabase
   - Для каждой из топ-3 идей:
   ```
   POST https://jlenlqhudcgkmnxnkguk.supabase.co/rest/v1/my_content
   Body: {"format": "...", "hook": "...", "topic": "...", "product": "...", "visual_style": "...", "sound_mood": "...", "status": "queued", "scores": {...}, "created_at": "{{now}}"}
   ```

6. **▶️ Trigger WF04** — noOp пока (WF04 ещё не настроен)
   - Добавь ноду-заглушку `n8n-nodes-base.noOp` с именем "▶️ Запустить WF04 Производство"

---

## СКОРИНГ — ДЕТАЛИ

**5 критериев (0–10 каждый, итого 0–50):**
1. `hook_strength` — насколько хук бьёт в боль аудитории (владельцы малого бизнеса РФ)
2. `pattern_match` — соответствие топ-паттернам (из T1)
3. `virality` — потенциал вирусности (провокация, инсайт, wow)
4. `product_relevance` — насколько естественно вписан продукт
5. `uniqueness` — не похоже на последние 30 дней контента

**Промт для LLM скоринга:**
```
Ты оцениваешь идеи контента для Telegram/Instagram канала "Бизнес на автопилоте" (аудитория: владельцы малого бизнеса РФ 25-45 лет).

Оцени каждую из идей по 5 критериям (0-10):
1. hook_strength: сила хука — бьёт ли в реальную боль предпринимателя
2. pattern_match: соответствие популярным паттернам
3. virality: потенциал распространения
4. product_relevance: органичность продукта в идее
5. uniqueness: оригинальность, не баян

Верни JSON массив (все 15 идей с оценками). Только JSON, без markdown.
```

---

## КАК РАБОТАТЬ

**Доступные инструменты:**
- `n8n_get_workflow` — прочитать workflow (передай workflow_id)
- `n8n_update_workflow` — обновить workflow целиком (PUT, передай workflow_id + полный объект workflow)
- `n8n_update_partial_workflow` — обновить отдельные ноды (передай workflow_id + массив operations с типами: updateNodeParams, addNode, removeNode, updateConnections)
- `n8n_get_executions` — посмотреть последние выполнения
- `supabase_query` — запросить данные из Supabase

**Порядок работы:**
1. Прочитай workflow: `n8n_get_workflow` (workflow_id: `9nY3DElCbXAObqCd`)
2. Замени noOp ноды реальными через `n8n_update_workflow` (передай полный JSON)
3. Запусти тест через webhook: `POST http://85.239.59.252:5678/webhook/wf035-trigger`
4. Проверь executions: `n8n_get_executions` (workflow_id: `9nY3DElCbXAObqCd`)

---

## ЧТО НЕ ТРОГАТЬ

- Другие workflows (WF01, WF02, WF03, WF04, WF05, WF06)

---

## ОБЯЗАТЕЛЬНО: Webhook для ручного тестирования

После реализации всех нод — добавь **Webhook триггер** параллельно основному триггеру:
- Тип: Webhook (HTTP Method: POST, Path: `wf035-trigger`)
- Подключи к той же первой ноде что и основной триггер
- Это позволяет запускать workflow вручную через `POST http://85.239.59.252:5678/webhook/wf035-trigger`

---

## КАК ОТЧИТАТЬСЯ ЛИДУ

1. Что за ноды добавлены вместо noOp
2. Результат теста: топ-3 идеи с оценками (format + hook + total)
3. Средний total топ-3 (цель: ≥ 35 из 50)
4. Есть ли записи в my_content со статусом `queued`
