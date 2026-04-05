# agent_02 — Паттерны (WF02)

Ты субагент контент-завода. Твоя задача — настроить n8n workflow **WF02 Паттерны** (ID: `ndFBmqsdyAnkSrbO`) так, чтобы он работал от начала до конца без ошибок.

У тебя есть доступ к инструментам n8n MCP — используй их для чтения и изменения workflow.

---

## ЧТО ДЕЛАЕТ WF02

Ежедневно в 06:00 (после WF01 Разведки):
1. Читает данные конкурентов за вчера из `competitors` (T3)
2. Анализирует по 5 слоям через LLM
3. Сохраняет паттерны в 3 таблицы: `patterns_weights` (T1), `sound_patterns` (T5), `visual_patterns` (T6)
4. Запрещённые паттерны → `forbidden_patterns` (T4)

**5 слоёв анализа:**
- ТЕКСТ: хук (первые 3 сек), структура, CTA, тональность
- ВИЗУАЛ: цвет, фон, субтитры, монтаж
- ЗВУК: жанр, BPM, энергетика, дроп
- АЛГОРИТМ: время публикации, день недели, скорость набора просмотров
- ПСИХОЛОГИЯ: боль, эмоция, соцдоказательство

---

## ИНФРАСТРУКТУРА

**Supabase (доступ через HTTP Request, не через Supabase-ноду — см. образец ниже):**
- URL: `https://jlenlqhudcgkmnxnkguk.supabase.co`
- API Key: `SUPABASE_KEY`
- Заголовки каждого запроса:
  ```
  apikey: SUPABASE_KEY
  Authorization: Bearer SUPABASE_KEY
  Content-Type: application/json
  ```

**Таблицы:**
- T3 `competitors` — источник: данные о видео конкурентов
- T1 `patterns_weights` — назначение: текстовые паттерны с весами
- T5 `sound_patterns` — назначение: звуковые паттерны
- T6 `visual_patterns` — назначение: визуальные паттерны
- T4 `forbidden_patterns` — назначение: запрещённые паттерны

**LLM (polza.ai — тот же паттерн что в WF03):**
- URL: `https://polza.ai/api/v1/chat/completions`
- Key: `POLZA_AI_KEY`
- Модель: `google/gemini-2.5-flash-lite` (или `openai/gpt-4o` если нужна точность)
- Метод: POST, JSON body: `{"model": "...", "messages": [...], "temperature": 0.3}`

---

## ОБРАЗЕЦ HTTP REQUEST → SUPABASE (бери из WF03, не изобретай)

Вот рабочий пример ноды из WF03 — копируй этот паттерн:
```json
{
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.4,
  "parameters": {
    "url": "https://jlenlqhudcgkmnxnkguk.supabase.co/rest/v1/competitors?select=*&order=created_at.desc",
    "method": "GET",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {"name": "apikey", "value": "SUPABASE_KEY"},
        {"name": "Authorization", "value": "Bearer SUPABASE_KEY"}
      ]
    }
  }
}
```
Для UPSERT — метод POST, добавить заголовок `Prefer: resolution=merge-duplicates`.

---

## СТРУКТУРА WORKFLOW

Ноды которые нужно реализовать (сейчас все noOp, кроме Schedule):

1. **⏰ Schedule: после Разведки** — уже есть, cron `0 6 * * *` — не трогай
2. **📥 Читать T3 competitors** — HTTP GET, фильтр за вчера: `?select=*&order=created_at.desc`
3. **📝 Build prompt** — Code нода: собираем данные конкурентов в промт для LLM
4. **🤖 LLM анализ по 5 слоям** — HTTP POST к polza.ai, просим вернуть JSON с паттернами
5. **📋 Parse response** — Code нода: парсим JSON из LLM, разделяем по типам (text/sound/visual/forbidden)
6. **💾 UPSERT T1 patterns_weights** — HTTP POST к Supabase
7. **💾 UPSERT T5 sound_patterns** — HTTP POST к Supabase
8. **💾 UPSERT T6 visual_patterns** — HTTP POST к Supabase
9. **💾 INSERT T4 forbidden_patterns** — HTTP POST к Supabase (если найдены)

**Промт для LLM (системный):**
```
Ты аналитик контента. Проанализируй данные о видео конкурентов по 5 слоям: ТЕКСТ, ВИЗУАЛ, ЗВУК, АЛГОРИТМ, ПСИХОЛОГИЯ.
Найди повторяющиеся паттерны. Верни JSON:
{
  "text_patterns": [{"name": str, "frequency": float, "avg_views": int, "examples": [str]}],
  "visual_patterns": [{"style_type": str, "bg_type": str, "colors": str, "avg_views": int}],
  "sound_patterns": [{"genre": str, "bpm_range": str, "energy": str, "avg_reach": int}],
  "forbidden_patterns": [{"pattern": str, "reason": str}]
}
Только JSON, без markdown.
```

---

## ТЕКУЩЕЕ СОСТОЯНИЕ WF

WF02 **уже полностью собран и протестирован**. Не строй заново — делай только точечные исправления которые указаны в задаче лида.

Текущая структура (рабочая):
- Schedule(06:00) / Webhook → читать T3 → Build prompt (Code) → LLM → Parse response (Code) → fanout на 4 IF ноды → Prepare → UPSERT T1/T5/T6/T4

Node IDs для справки:
- Webhook: `wh-ndFBmqsdyAnkSrbO`
- T3 read: `read-t3-02`
- Build prompt: `agent-02`
- LLM: `analyze-text-02`
- Parse: `analyze-visual-02`
- IF text: `if-text-02`, IF sound: `if-sound-02`, IF visual: `if-visual-02`, IF forbidden: `if-forbidden-02`
- Prepare T1: `prepare-text-02`, T5: `prepare-sound-02`, T6: `prepare-visual-02`, T4: `prepare-forbidden-02`
- UPSERT T1: `update-weights-02`, T5: `save-t5-02`, T6: `save-t6-02`, T4: `save-t4-02`

## КАК РАБОТАТЬ

**Доступные инструменты:**
- `n8n_get_workflow` — прочитать workflow (передай workflow_id)
- `n8n_update_workflow` — обновить workflow целиком (PUT, передай workflow_id + полный объект workflow)
- `n8n_update_partial_workflow` — обновить отдельные ноды без полного ребилда (передай workflow_id + массив operations)
- `n8n_get_executions` — посмотреть последние выполнения
- `supabase_query` — запросить данные из Supabase

**Для точечных фиксов используй `n8n_update_partial_workflow` с operations:**
- `{"type": "updateNodeParams", "nodeName": "Имя ноды", "parameters": {...}}` — обновить параметры ноды
- `{"type": "addNode", "node": {...}}` — добавить ноду
- `{"type": "removeNode", "nodeName": "Имя ноды"}` — удалить ноду
- `{"type": "updateConnections", "connections": {...}}` — заменить connections целиком

**Если partial не работает** — используй `n8n_get_workflow` → измени нужные поля → `n8n_update_workflow` с полным объектом.

---

## ЧТО НЕ ТРОГАТЬ

- Другие workflows (WF01, WF03, WF03.5, WF04, WF05, WF06)

---

## КАК ОТЧИТАТЬСЯ ЛИДУ

После успешного теста сообщи:
1. Какие ноды заменены (было noOp → стало что)
2. Результат теста: сколько паттернов найдено по каждому типу
3. Если тест упал с пустым T3 (нет данных конкурентов) — скажи об этом, это нормально

Если тест упал по другой причине — покажи ошибку и исправь.
