# АРХИВ — Instagrapi (неофициальный Instagram API)

**Дата архивации:** 2026-04-03
**Причина:** Заменён на Buffer GraphQL API (официальный)

---

## Что такое Instagrapi

Неофициальная Python-библиотека, эмулирует мобильное приложение Instagram. Работает без разрешений Meta.

## Где стоит на сервере

- Сервер: `85.239.59.252`
- Путь: `/opt/agents/` (предположительно)
- Порт: `8001`
- Запуск: предположительно через systemd или screen

## Что умеет (и чем можно заменить Buffer если что)

**Публикация:**
- `POST /upload_photo` — фото в ленту
- `POST /upload_video` — видео/Reel
- `POST /upload_story_photo` — фото-Story
- `POST /upload_story_video` — видео-Story

**Статистика:**
- `POST /get_stats` — просмотры, лайки, охват, сохранения по media_ids

**Пример запроса публикации:**
```json
POST http://localhost:8001/upload_video
{
  "video_path": "/tmp/video.mp4",
  "caption": "текст поста",
  "thumbnail_path": "/tmp/thumb.jpg"
}
```

**Пример запроса статистики:**
```json
POST http://localhost:8001/get_stats
{
  "media_ids": ["1234567890", "0987654321"]
}
```

## Почему заменили на Buffer

- Buffer — официальный партнёр Meta, не нарушает ToS
- Buffer GraphQL API даёт и публикацию и аналитику
- Instagrapi может сломаться при обновлении Instagram

## Как вернуть если Buffer перестанет работать

1. Убедиться что Instagrapi жив: `curl http://85.239.59.252:8001/health`
2. В agent_06.md вернуть раздел "Instagrapi stats"
3. В agent_05.md (если появится) заменить Buffer на Instagrapi endpoint
4. Промты агентов взять из этого файла как образец
