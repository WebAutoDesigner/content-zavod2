# agent_06 — Аналитика (WF06)

Ты субагент контент-завода. Твоя задача — настроить n8n workflow **WF06 Аналитика** (ID: `xGdY3sEB1QKN72EO`).

**Это самый сложный workflow** — два режима (ежедневный + воскресный), внешние API, динамический порог. Читай внимательно.

У тебя есть доступ к инструментам n8n MCP — используй их.

---

## ЧТО ДЕЛАЕТ WF06

**Ежедневно в 02:00:**
1. Получает статистику постов из Buffer GraphQL API
2. Получает статистику из Telegram Bot API
3. Читает T1 (паттерны) + T2 (опубликованный контент) + порог "залетел"
4. LLM анализирует корреляцию паттернов и охвата
5. Обновляет веса в T1 + T5 + T6
6. Помечает залетевшие посты в T2 (`zalitel = true`)
7. IF воскресенье → дополнительный глубокий анализ + отчёт

**В воскресенье (дополнительно):**
8. LLM глубокий анализ всей недели
9. Обновление динамического порога "залетел"
10. Qwen форматирует отчёт
11. Отправка отчёта в Telegram Monitor бот

---

## ИНФРАСТРУКТУРА

**Instagrapi (статистика постов Instagram):**
- URL: `http://localhost:8001/get_stats` (n8n и Instagrapi на одном сервере)
- Метод: POST
- Body: `{"media_ids": [<IDs из T2 за 7 дней>]}`
- Ответ: `[{"media_id": "...", "views": int, "likes": int, "reach": int, "saves": int}]`
- Если недоступен — Code нода возвращает пустой массив и продолжает без Instagram-данных

**Supabase — через HTTP Request:**
- apikey: `SUPABASE_KEY_PLACEHOLDER`
- Authorization: `Bearer SUPABASE_KEY_PLACEHOLDER`

**Таблицы:**
- T1 `patterns_weights` — читаем веса, пишем обновлённые
- T2 `my_content` — читаем контент с метриками, обновляем флаг `zalitel`
- T5 `sound_patterns` — обновляем веса
- T6 `visual_patterns` — обновляем веса
- T7 — порог "залетел" (храни в `agent_memory` как `{"type": "threshold", "current_value": 200, "week_number": 1}`)

**LLM — polza.ai:**
- URL: `https://polza.ai/api/v1/chat/completions`
- Key: `POLZA_AI_KEY`
- Ежедневный анализ: `google/gemini-2.5-flash-lite`, temperature 0.2
- Воскресный отчёт (форматирование): `qwen/qwen3-8b`
- Глубокий анализ воскресенья: `google/gemini-2.5-flash-lite`

**Telegram Bot API (Monitor бот — только воскресенье):**
- URL: `https://api.telegram.org/bot{TOKEN}/sendMessage`
- Токен: уточни у пользователя (placeholder `{{TELEGRAM_BOT_TOKEN}}`)
- chat_id: уточни у пользователя (placeholder `{{TELEGRAM_MY_CHAT_ID}}`)
- parse_mode: `HTML`

---

## ДИНАМИЧЕСКИЙ ПОРОГ "ЗАЛЕТЕЛ"

```
Неделя 1: 200 просмотров
Неделя 2: 400 просмотров
Неделя 3: 600 просмотров
Неделя 4: 1000 просмотров
Месяц 2: 2000 просмотров
Месяц 3: 5000 просмотров
Месяц 4+: автоматически (среднее * 1.5)
```

---

## СТРУКТУРА WORKFLOW

**Ежедневная ветка:**

1. **⏰ Schedule** — уже есть, cron `0 2 * * *` — не трогай

2. **📊 Instagrapi stats** — HTTP POST к `http://localhost:8001/get_stats`
   - Сначала Code нода читает media_ids из T2 за 7 дней
   - Body: `{"media_ids": [...]}`
   - Если недоступен — возвращай `[]` и продолжай

3. **✈️ Telegram stats** — HTTP GET к Telegram Bot API
   - `getChatMembersCount` для подсчёта подписчиков
   - Если токен неизвестен — оставь placeholder, сообщи лиду

4. **📥 Supabase: T1 + T2 + порог** — параллельные HTTP GET, Merge нода

5. **🤖 LLM анализ** — HTTP POST к polza.ai
   - Промт: сопоставь паттерны из T1 с реальными просмотрами из Buffer
   - Верни JSON: `{"updates": [{"pattern_name": str, "new_weight": float, "reason": str}]}`
   - Вес 0.0–1.0, изменение не более ±0.1 за раз

6. **💾 UPSERT T1 + T5 + T6** — HTTP POST к Supabase

7. **🔥 UPDATE T2: zalitel** — HTTP PATCH к Supabase
   - Только где views > текущий порог

8. **📅 IF: воскресенье?** — Code нода: `new Date().getDay() === 0`

**Воскресная ветка:**

9. **🧠 LLM глубокий анализ** — HTTP POST к polza.ai

10. **⚖️ Code: обновить порог** — считает новый порог, пишет в agent_memory

11. **🤖 Qwen: форматировать отчёт** — polza.ai, эмодзи-шаблон: 📸 Instagram ✈️ Telegram 📊 Итого 🔥 Залетел 📉 Провалился 🧠 Вывод

12. **📡 Telegram sendMessage** — отправка в Monitor бот

---

## КАК РАБОТАТЬ

1. Прочитай workflow: `n8n_get_workflow` (ID: `xGdY3sEB1QKN72EO`)
2. Реализуй ежедневную ветку
3. Реализуй воскресную ветку
4. Сохрани через `n8n_update_workflow` или `n8n_update_partial_workflow`
5. Тестируй: `n8n_test_workflow`
6. Воскресную ветку тестируй вручную (измени IF на `true`, потом верни)

---

## ЧТО НЕ ТРОГАТЬ

- Другие workflows (WF01–WF05)
- Instagrapi на localhost:8001 — не удалять с сервера (архив, см. `instagrapi_archived.md`)

---

## БЛОКЕРЫ — СООБЩИ ЛИДУ ЕСЛИ:

- Неизвестен токен Telegram Monitor бота
- Instagrapi на localhost:8001 недоступен (не критично — workflow продолжит без Instagram-данных)
- Таблица T2 `my_content` не содержит полей `zalitel` или `media_id`

---

## ОБЯЗАТЕЛЬНО: Webhook для ручного тестирования

После реализации всех нод — добавь **Webhook триггер** параллельно основному триггеру:
- Тип: Webhook (HTTP Method: POST, Path: `wf06-trigger`)
- Подключи к той же первой ноде что и основной триггер
- Это позволяет запускать workflow вручную через `POST http://85.239.59.252:5678/webhook/wf06-trigger`

---

## КАК ОТЧИТАТЬСЯ ЛИДУ

1. Что за ноды добавлены вместо noOp
2. Результат теста: сколько паттернов обновлено, примеры reason
3. Какие блокеры (Telegram токен и т.д.)
4. Что нужно от пользователя для завершения
