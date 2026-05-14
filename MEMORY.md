# MEMORY.md

Compact project memory for the content factory as maintained from Codex.

## Project Summary

- Project path: `C:\Users\хост\agent-mcp-server`.
- GitHub: old repo `https://github.com/nikita2114gpt/content-zavod`; new target repo for pushes is `https://github.com/WebAutoDesigner/content-zavod2.git`.
- Purpose: local working repo for the content factory, including historical agent-runner/MCP files and n8n workflow backups.
- Main runtime file: `index.js`.
- Historical Claude/GLM agent prompts live in `agents/`.
- Workflow JSON backups live in `workflows/`.
- On 2026-05-13 active n8n workflow JSON backups were synced from the live n8n API into `workflows/` and sanitized before git commit: Supabase service role, Polza, and Apify keys are stored only as placeholders in tracked workflow files.
- Queue-based database/workflow spec: `docs/content-factory-db-spec.md`.
- Queue-based n8n workflow logic spec: `docs/content-factory-workflows-spec.md`.
- Supabase SQL migration for the queue-based schema: `supabase/content_factory_schema.sql`.
- Supabase MCP was added to Codex config at `C:\Users\С…РѕСЃС‚\.codex\config.toml` for project ref `xxnzqridvepixzireqjh`. It uses the official hosted MCP URL and requires Codex/MCP authorization after restart; the provided `sb_secret` key is useful for API/Storage but is not the same as Supabase MCP account authorization.
- The queue-based Supabase schema was applied to project ref `xxnzqridvepixzireqjh` on 2026-05-13 through Supabase Management API using the user's Supabase access token. Verification showed 13 tables, 17 indexes, RLS enabled on 13 tables, and Storage buckets `competitors` and `packages`.
- n8n API key was updated in `C:\Users\С…РѕСЃС‚\.mcp.json` and Codex config. The key works against `http://85.239.59.252:5678/api/v1`.
- WF00 Queue Monitor was created in n8n with ID `HxwDUDUzbg5cgZ7a` and local backup `workflows/WF00_queue_monitor.json`. It checks `content_queue` for queued close/premium/viral Reels and creates a `competitor_batches` row when fewer than 9 queued Reels remain. On 2026-05-13 it was hardened to check for existing active batches (`started`, `selection_done`, `analysis_started`) before creating a new batch, so repeated low-queue runs do not create duplicate competitor-analysis batches. Manual webhook registration behaved unexpectedly in n8n 2.13.4 despite activation; revisit after workflow publishing/MCP reload if manual trigger is needed.
- WF01 Batch Competitor Scouting was created in n8n with ID `YDa5o6cQg2B4798f` and local backup `workflows/WF01_batch_competitor_scouting.json`. It reads `competitor_batches.status=started`, active Instagram `competitor_accounts`, scrapes competitor posts through Apify, scores videos, selects all strict/extreme matches plus near-threshold fill to at least 10 when possible, writes `competitor_videos`, and updates the batch to `selection_done` or `failed` if no accounts exist. Verified on 2026-05-13: workflow is active in n8n, has 14 nodes, Supabase REST to project `xxnzqridvepixzireqjh` returns 200 with the project service role key, and the remote workflow has no Supabase/Apify placeholders.
- WF01.5 Video Preparation was created in n8n with ID `lfPCbkG4b9u7oPif` and local backup `workflows/WF015_video_preparation.json`. It runs every 15 minutes or via webhook `wf015-video-preparation`, reads one selected `competitor_videos` row with status `qualified`/`near_threshold`, locks it as `raw_saved`, calls the FFmpeg preparation endpoint, saves transcript/keyframes/vision/audio metadata into `competitor_video_analysis`, then marks the video `ready_for_pattern`. It is active and n8n validation is clean with 0 errors. Safe webhook test on 2026-05-13 returned `No selected videos are waiting for WF01.5` because the current selected-video queue was empty.
- On 2026-05-13 WF01.5's request to `/prepare_competitor_video` was expanded with explicit analysis instructions for competitor viral-table Reels: transcript with timestamps, OCR, first-frame hook, scene timeline, hands/install/product cues, brand/face risks, audio role, and "do not discard; mark risk" behavior. This was a static n8n config change only; no live workflow/LLM test was run afterward.
- FFmpeg render server now has `POST /prepare_competitor_video` on `http://85.239.59.252:8003`. The endpoint downloads a competitor video, extracts audio and keyframes, calls polza.ai transcription with `openai/gpt-4o-transcribe`, calls polza.ai vision/OCR reasoning with `openai/gpt-5.2`, returns basic audio metadata, and writes temporary files under `/root/renders/competitors/{video_id}`. PM2 process `ffmpeg-server` was syntax-checked and restarted successfully after adding the endpoint. On 2026-05-13 both FFmpeg and Playwright render servers were updated to expose generated files through `/renders/{filename}` and include `file_url` in render responses; external health checks and a test mp4 URL returned HTTP 200.
- WF02 Pattern Extraction was created in n8n with ID `Lqly5A2zvEzKWrej` and local backup `workflows/WF02_pattern_extraction_queue.json`. It runs every 20 minutes or via webhook `wf02-pattern-extraction`, reads one `competitor_videos.status=ready_for_pattern` row, loads its `competitor_video_analysis`, sends the combined package to polza.ai `openai/gpt-5.2`, extracts the 9-layer pattern, writes `content_patterns`, writes four `pattern_recipes` (`close_to_competitor`, `more_viral`, `more_premium`, `story`), then marks the source video `pattern_extracted`. It is active and n8n validation is clean with 0 errors. Safe webhook test on 2026-05-13 returned `No ready videos are waiting for WF02` because the current ready queue was empty.
- On 2026-05-13 WF02's GPT-5.2 pattern prompt was tightened to analyze evidence, not generic inspiration: first-frame stop, visual curiosity, pacing, proof, audio role, emotion, desire trigger, CTA mechanics, x5/x20 performance, and allowed-but-risk-marked hands/body/logo cases. Static validation passed after the change.
- WF03 Variant Factory was created in n8n with ID `Wm9gHnR8qCJIa00D` and local backup `workflows/WF03_variant_factory_queue.json`. It runs every 30 minutes or via webhook `wf03-variant-factory`, reads one `content_patterns` row that has no `content_variants` yet, sends the pattern plus recipes to polza.ai `openai/gpt-5.2`, generates a bank of 12 Reel variants (4 close, 4 viral, 4 premium), 4 Story variants, and 3 caption/CTA variants, then writes them into `content_variants` with status `idea_created`. It is active and n8n validation is clean with 0 errors. Safe webhook test on 2026-05-13 returned `No generated-ready patterns are waiting for WF03` because no ungenerated patterns currently exist.
- On 2026-05-13 WF03 was strengthened: it now reads recent `pattern_performance` rows with the pattern and passes learning notes into GPT-5.2; the prompt demands 12 production-ready Reels with 4 distinct first-frame mechanics per close/viral/premium group, 4 Stories, 3 captions, source pattern preservation, uniqueness moves, render notes, and optional AI-video prompts. Static validation passed after the change.
- WF03.5 Score And Queue was created in n8n with ID `8vhOXr9m472gDHSV` and local backup `workflows/WF035_score_and_queue.json`. It runs every 30 minutes or via webhook `wf035-score-queue`, reads `content_variants.status=idea_created`, uses polza.ai `openai/gpt-5.2` to select one close, one viral, one premium, one story, plus caption variants, writes winning rows to `content_queue`, marks selected variants `queued`, and marks unselected variants from the same pattern as `rejected` to avoid reprocessing losers forever. On 2026-05-13 its GPT-5.2 selector prompt was strengthened: it now scores virality first, then source-pattern similarity, first frame, retention, lead potential, premium feel, uniqueness/safety, and explicitly rejects generic/unsafe/copycat variants. It is active. Safe webhook test on 2026-05-13 returned `No variants are waiting for WF03.5`.
- On 2026-05-13 WF03.5 was connected to `pattern_performance` memory through embedded `content_patterns.pattern_performance(...)`. Its prompt now uses learning notes when selecting winners and limits `ai_video` to at most one Reel when it clearly improves virality/premium feel. Static validation passed after the change.
- WF04 Daily Package Builder was created in n8n with ID `kybtRVyiUkrgnwzT` and local backup `workflows/WF04_daily_package_builder.json`. It runs daily at 09:00 or via webhook `wf04-build-package`, reads queued close/premium/viral/story rows, creates a `daily_packages` row, creates `package_assets` rows, leaves the package in `in_production`, and marks queue rows `produced`. WF04 now creates render specs only; final readiness belongs to WF04.5. On 2026-05-13 the broken Russian CTA fallback was fixed and the package status update node was restored after a partial-update corruption. It is active.
- WF04.5 Render Assets was created in n8n with ID `wrEgOmmyFmfNOJVH` and local backup `workflows/WF045_render_assets.json`. It runs every 10 minutes or via webhook `wf045-render-assets`, reads one pending `package_assets` row for `reel_close`, `reel_premium`, `reel_viral`, or `story`, pulls its package and variant context, renders via the existing FFmpeg server (`/render` typewriter/result_card) or Playwright server (`/render_chat`), stores the local mp4 path in `package_assets.file_path`, stores the public render URL in `package_assets.storage_url`, marks the asset `qc_status=passed` or `failed`, and marks the package `ready` only when no pending/failed reel/story assets remain. It is active. Safe webhook test on 2026-05-13 returned `No pending package assets for WF04.5`.
- On 2026-05-13 WF04.5 was fixed and extended: broken Russian fallback text was replaced, `processing` assets now block package readiness, `production_mode=ai_video` submits a Polza `/v1/media` request using `openai/sora-2` with OpenAI/Google fallback routing, and a separate GET status node polls already-submitted Polza media IDs. Static validation passed after the change; no paid render/AI-video test was run.
- WF05 Delivery Telegram was created in n8n with ID `NQRIRMhgVQb8OxV2` and local backup `workflows/WF05_delivery_telegram.json`. It runs daily at 09:30 or via webhook `wf05-deliver-package`, reads one `daily_packages.status=ready`, reads its `package_assets`, sends each reel/story mp4 to Telegram through `sendVideo` using `storage_url`, sends a summary/caption/CTA text message, and marks the package `delivered`. It is active. Safe webhook test on 2026-05-13 returned `No ready packages to deliver`.
- On 2026-05-14 a minimal 1-video test was run from a compressed local sample of `IMG_6739.mp4` without AI-video generation. WF01.5 and WF02 succeeded; WF01.5 produced weak/empty transcript/vision fields on the tiny sample, but WF02 still extracted one useful pattern and four recipes. WF03/WF03.5 gained `test_mode/minimal` branches that skip Polza LLM calls and create/select deterministic test variants, so plumbing can be tested without spending tokens. WF03 also now treats Polza API errors as failures in normal mode instead of inserting zero variants.
- The same minimal test found and fixed production-chain bugs: WF03.5 had a syntax error and now sanitizes unsupported `production_mode` values away from `ai_video` during minimal tests; WF04 metadata asset rows now use the same key set as reel/story rows to satisfy Supabase bulk insert; WF04.5 now sanitizes FFmpeg text lines instead of passing raw JSON scene objects into `drawtext`. After these fixes WF03 -> WF03.5 -> WF04 -> WF04.5 produced a ready package with 3 rendered reels and 1 rendered story, all without AI-video.
- WF05 was rebuilt so a Code node prepares Telegram requests and a separate HTTP Request node sends them. Direct n8n access to `api.telegram.org` from the server timed out, so WF05 now routes Telegram Bot API calls through the existing Cloudflare Worker `dark-field-8e65.nikitagpt2114.workers.dev` using URLs like `/bot<TOKEN>/<method>`. Live WF05 has the Telegram bot token and target chat id filled in n8n; tracked JSON backups must keep placeholders. On 2026-05-14 a safe Worker `getMe` test from n8n returned `ok: true` for bot `KontentZavBot`; the temporary test workflow was deleted afterward. Full WF05 delivery was not rerun to avoid duplicate Telegram videos from the earlier timed-out attempt.
- On 2026-05-14 the user pressed `/start` in `KontentZavBot`; `getUpdates` confirmed private chat id `1347534574`. A manual multipart upload test sent the ready package's 3 Reels + 1 Story + summary to Telegram successfully (message ids 4-8). Telegram rejected WF05's URL-based `sendVideo` for render URLs with `Bad Request: wrong type of the web page content`, so future WF05 automation should be converted from URL-based sendVideo to file-upload/multipart delivery or an HTTPS media proxy that Telegram accepts. The test package `20ecad3d-e014-4e6c-8955-0ee1ebe7ebc5` was marked `delivered` manually to avoid duplicate sends. WF05's `Supabase: mark delivered` node was fixed to stop writing nonexistent `daily_packages.delivered_at`; it now patches only `status` and `updated_at`.
- Later on 2026-05-14 more WF05 delivery diagnostics showed: n8n HTTP Request can download render mp4s as binary, but direct multipart upload from the VPS to `api.telegram.org/sendVideo` times out even with IPv4; raw `curl -F` from the VPS also times out. The existing `/root/telegram-relay-server` on port `8005` can forward small JSON Telegram requests, but cannot solve file upload without proxy/Cloudflare. Caddy was updated on the VPS to expose render files over HTTPS through `https://cvit-auto.ru/cf-ffmpeg/...` and `https://cvit-auto.ru/cf-playwright/...`; the URLs return `video/mp4`, but Telegram still rejects URL-based `sendVideo` with `wrong type of the web page content` or `failed to get HTTP URL content`. Therefore the real production fix is either: update/deploy a Cloudflare Worker that accepts `{video_url, caption}` and performs multipart upload from Cloudflare, or explicitly start/use the VPS `proxy.service` for Telegram file uploads. Do not start `proxy.service` unless the user explicitly permits it.
- WF05.5 Telegram Feedback Parser was created in n8n with ID `A08giAKYArdNqDqB` and local backup `workflows/WF055_feedback_parser.json`. It receives webhook `wf055-feedback`, reads the latest delivered/ready package, uses polza.ai `openai/gpt-5.2` to parse natural Russian Telegram text into intents (`published`, `revise`, `approve`, `reject`, `archive`, `ask_status`, `resend_links`), writes `content_feedback`, marks a package `published` when the user says it was published, and creates `published_posts` rows from package assets so WF06 has learning inputs. The LLM parser handles typos, profanity, vague requests, target assets, clarification needs, and falls back to local parsing if JSON parsing fails. On 2026-05-13 a live webhook test with a Russian status message returned `Feedback saved`; the test row was deleted afterward.
- On 2026-05-13 WF05.5 gained a revision branch: if GPT-5.2 parses Telegram feedback as `revise`, it marks the daily package `needs_revision`, resets the package reel/story assets to `qc_status=pending`, and carries the raw change request into `qc_notes` for rerender context. Static validation passed after the change; no Telegram/webhook test was run afterward.
- WF06 Performance Learning was created in n8n with ID `9LYOOFiIxZBWjlME` and local backup `workflows/WF06_performance_learning_queue.json`. It runs every 3 days at 10:00 or via webhook `wf06-performance-learning`, reads `published_posts` rows with metrics that do not already have `pattern_performance`, calculates success levels (`successful_x5`, `extreme_x20`, etc.), sends numeric rows and post context to polza.ai `openai/gpt-5.2` for strategic learning notes, then writes enriched learning rows. On 2026-05-13 it was changed to avoid duplicate learning rows by using a left join/filter against `pattern_performance` and to add GPT-5.2 learning strategy before insert. It is active. Safe webhook test on 2026-05-13 returned `No metrics available for WF06`.

### n8n MCP Connection Tutorial / Gotchas

Problem encountered on 2026-05-13: Codex did not load n8n MCP even after restart because `C:\Users\С…РѕСЃС‚\...` appeared in `C:\Users\С…РѕСЃС‚\.codex\config.toml` as mojibake instead of the real Windows username `хост`. Do not point MCP directly at paths containing the Cyrillic username.

Working fix:

1. Use an ASCII launcher:

```text
C:\codex-tools\n8n-mcp.cmd
```

2. `C:\Users\С…РѕСЃС‚\.codex\config.toml` should contain:

```toml
[mcp_servers.n8n]
command = "C:\\codex-tools\\n8n-mcp.cmd"
args = []
```

3. The launcher should set:

```text
MCP_MODE=stdio
LOG_LEVEL=error
DISABLE_CONSOLE_OUTPUT=true
N8N_API_URL=http://85.239.59.252:5678/api/v1
N8N_API_KEY=<working n8n public API key>
```

4. The actual MCP entrypoint used by the launcher is:

```text
%LOCALAPPDATA%\npm-cache\_npx\b6a381d62ce0fe56\node_modules\n8n-mcp\dist\mcp\index.js
```

5. After changing MCP config, fully restart Codex. In the next session, immediately verify with:

```text
n8n_health_check({ "mode": "status" })
```

Expected successful result:

```text
success: true
status: ok
apiUrl: http://85.239.59.252:5678/api/v1
```

Do not waste time repeatedly checking `list_mcp_resources`; n8n MCP exposes tools, not resources. Use `n8n_health_check` directly when available.

If n8n MCP still does not appear:

- Check `C:\Users\С…РѕСЃС‚\.codex\config.toml` for mojibake paths.
- Check that `C:\codex-tools\n8n-mcp.cmd` exists.
- Check that the n8n key still works with:

```text
GET http://85.239.59.252:5678/api/v1/workflows?limit=1
Header: X-N8N-API-KEY
```

If API returns `401`, ask for a fresh n8n public API key. JWT-looking n8n keys can be valid only if they were created as public API keys; UI/session JWTs do not work.

## External Memory Sources

The fuller historical project memory is currently in Claude project memory files:

- `C:\Users\хост\.claude\projects\C--Users-----\memory\project_content_factory.md`
- `C:\Users\хост\.claude\projects\C--Users-----\memory\project_agent_runner.md`

Read these before major content-factory work. Treat the agent-runner file as historical context unless the user explicitly asks to use it.

## Content Factory State

- The active n8n production chain currently contains 11 active queue-based workflows: WF00, WF01, WF01.5, WF02, WF03, WF03.5, WF04, WF04.5, WF05, WF05.5, WF06. Older emoji-named workflows from 2026-05-07 are still present but inactive and should be treated as historical unless explicitly restored.
- Workflow backups are saved locally in `C:\Users\хост\agent-mcp-server\workflows\`.
- Production chain: `WF00 -> WF01 -> WF01.5 -> WF02 -> WF03 -> WF03.5 -> WF04 -> WF05 -> WF05.5 -> WF06`.
- Daily target: 3 content units, typically `1 Reel + 1 Post + 1 Story`.
- FFmpeg render server and Playwright server are part of the production stack.
- Supabase stores patterns, competitors, generated content, visual/sound patterns, forbidden patterns, and agent memory.

## Content Factory Redesign Decisions

As of 2026-05-13, the intended direction is not a generic content generator and not a from-scratch rebuild. Tune/rework the current WF01-WF06 mechanism around this loop:

`successful competitor videos -> deep pattern analysis -> similar but unique content -> finished daily package -> user publishes manually -> analytics/self-learning`.

The factory should learn primarily from successful competitor accounts/videos, not from the user manually defining audience pains, ICP, or marketing angles. The user gives Instagram competitor accounts, optionally specific competitor videos, and later optionally product photos/materials.

Core production cadence should be queue-based, not daily re-analysis-based:

- Run competitor analysis in batches, e.g. collect/analyze about 50 competitor videos at a time.
- Filter those down to all videos that meet the selection criteria for deep pattern extraction, with a minimum target of 10 videos per batch when enough usable material exists. Do not cap at 10 if more videos are genuinely strong. If fewer than 10 videos pass the strict criteria, fill the remaining slots with the closest near-threshold videos by score relative to the rest of the batch, not random/average videos.
- Generate and score a bank of content ideas from those patterns.
- Put the best ideas into a production queue.
- Each day, WF04 produces the daily package from queued ideas.
- When the queue drops below a threshold, e.g. fewer than 9 remaining Reels / about 3 days of stock, trigger a new competitor-analysis batch.
- Do not force daily competitor re-analysis if there are enough strong queued ideas.

### Daily Output Target

- 3 finished Reels:
  - 1 close to the original competitor pattern.
  - 1 more premium.
  - 1 more viral.
- 1 Story.
- 3 captions/descriptions, one per Reel.
- CTA.
- Source references, pattern recipes, forbidden/caution items, and score breakdown.

The user publishes final versions manually. The factory must deliver finished assets and metadata, not auto-post by default.

### WF01 - Competitor Scouting

WF01 is a raw-data collector, not the marketing analyst.

- Current platform priority: Instagram only. TikTok can be added later only if explicitly requested.
- Input: competitor account links; optional specific video links.
- Work in batches rather than as a daily full restart. A normal scouting run should collect about 50 competitor videos, then pass all qualified/top videos forward. The expected minimum is 10 videos when enough usable material exists, but the count can be higher if more videos meet the criteria. If only e.g. 8 videos pass strict criteria, add the 2 best near-misses by score/closeness to criteria.
- Qualified videos:
  - top 20% within account, or
  - at least 2x average account views, or
  - strong engagement, or
  - extreme viral.
- Extreme viral means about 20x average account performance and must not be discarded even if some engagement metrics are missing.
- Do not discard videos just because there is a visible external brand/logo or partial human presence such as hands/body without faces. These can often be adapted/unique-ified.
- WF01 should save videos/metadata in a form WF01.5/WF02 can consume.

### AI/LLM Model Decisions

All LLM and media-generation calls should go through polza.ai by default, not direct OpenAI/other provider APIs.

Chosen models:

- Main reasoning/brain model: `openai/gpt-5.2`.
  - Use for WF02 pattern analysis.
  - Use for WF03 generation of 12 variants.
  - Use for WF03.5 selection/scoring of the 3 final Reels and Story.
  - Use for WF04 creative direction and prompts when production needs a high-quality decision.
  - Use for WF06 self-learning and strategy conclusions.
- Transcription: `openai/gpt-4o-transcribe`.
  - Backup fallback: `openai/whisper-1`.
  - Transcription cost is minute-based, not token-based.
- Image generation: `openai/gpt-image-1.5` by default; `google/gemini-3.1-flash-image-preview` can be tested as an alternative.
- AI video generation:
  - Main: `openai/sora-2`.
  - Backup if Sora output fails: `google/veo3_fast`.
  - Do not use expensive premium modes such as `openai/sora-2-pro` or `google/veo3` by default.
- Final montage/rendering is not done by LLM. Use FFmpeg render server and Playwright render server for assembly, overlays, audio, captions, and final 9:16 output.

Daily production target should usually be hybrid:

- 2 Reels plus Story through image/frame stitching, overlays, FFmpeg/Playwright, and music.
- 1 Reel through AI video when it materially improves the hook, premium feel, or viral first frame.
- If AI video fails after limited retries, fall back to montage rather than burning budget.

### WF01.5 - Video Preparation

Use FFmpeg, Whisper through polza.ai, Vision/OCR, and audio analysis to turn competitor videos into structured raw packages.

- FFmpeg extracts audio, extracts keyframes, creates previews if needed, and removes heavy temporary files after downstream processing is complete.
- Whisper via polza.ai produces `speech_transcript`, timestamped `speech_segments`, and handles no-speech videos cleanly.
- Vision/OCR reads text on screen and describes keyframes/visual content.
- Audio analysis keeps BPM/energy/genre/drop data as a secondary signal.
- Store heavy files in Supabase Storage and metadata/analysis in tables.

Chosen storage structure:

- `competitor_videos` for one row per competitor video and performance metrics.
- `competitor_video_analysis` for transcript/OCR/timeline/audio/keyframe analysis.
- Supabase Storage for original/temporary video, audio, keyframes, previews.

Status pipeline:

`found -> qualified -> raw_saved -> transcript_done -> visual_done -> audio_done -> ready_for_wf02 -> pattern_extracted -> generated_variants -> archived`

### WF02 - Pattern Extraction

WF02 explains why a competitor video worked and converts it into a transferable recipe. The existing 5-layer idea is a base, but should be expanded to 9 layers:

1. `hook_pattern`: what stops the viewer in the first 1-2 seconds.
2. `visual_pattern`: what is visible and why it attracts attention.
3. `scenario_pattern`: scene/order structure.
4. `retention_pattern`: why viewers keep watching.
5. `desire_trigger`: desire being sold, such as status, gift, rarity, premium feel, attention.
6. `proof_pattern`: trust signals, such as real install, hands, packaging, material proof, client context.
7. `audio_pattern`: role of sound, not just BPM.
8. `cta_pattern`: how the video leads to action.
9. `adaptation_recipe`: what to keep, what to change, and what not to copy.

WF02 should save top patterns, sound patterns, visual patterns, hooks, scenario structures, forbidden/caution elements, generation recipes, source references, and pattern score.

Forbidden/caution elements include external logos/brands, identifiable faces as key elements, exact text, exact copied frames, and legally/reputationally risky elements. These should be removed, replaced, or unique-ified.

### WF03 - Idea/Variant Factory

- Input: top patterns, concrete source references, recipes, and copy/brand/face restrictions.
- Generate 12 Reel variants per selected pattern/reference set:
  - 4 close to competitor/original.
  - 4 more viral.
  - 4 more premium.
- Each group should have different first frames.
- Also generate 4 Story variants tied to the same daily Reels.
- Generate captions/descriptions for Reels.
- On startup, assume the user has little or no product material. Build from competitor patterns. Later, if product photos are provided, use the user's product while borrowing surrounding style/presentation from competitor-derived patterns.
- Each variant should include first frame, screen text, shot-by-shot scenario, what was borrowed from the pattern, what was changed, CTA, and source pattern.
- Explanations are primarily for internal self-learning, not verbose user-facing output.
- WF03 should generate a bank of ideas from the current batch of top patterns, not only one day's package. The bank should then feed a queue for daily production.

### WF03.5 - Scoring And Daily Package Selection

Select:

- 1 Reel from the close-to-original group.
- 1 Reel from the premium group.
- 1 Reel from the viral group.
- 1 Story.
- 3 captions.
- CTA.

Score priority:

1. Virality.
2. Similarity to a successful competitor pattern.
3. First-frame strength.
4. Retention potential.
5. Interest/lead potential.

Auto-block when first frame is weak, scenario is too generic, variant is too far from the source pattern, external brand/logo/face is not removed or unique-ified, or content cannot be produced.

WF03.5 should store full score breakdown for all 12 Reels and 4 Stories, including why winners were selected and why losers were rejected, so WF06 can compare forecasts with actual results.

WF03.5 also owns queue admission: only ideas that pass scoring and safety/uniqueness checks become `approved_for_queue` / `queued`. Keep enough queued ideas for multiple days, and trigger a new WF01-WF03 batch when the queue is low.

### WF04 - Production

WF04 should produce finished assets, not only scripts.

- Output: 3 vertical 9:16 Reels, 1 Story, screen text, music/audio, CTA, and captions metadata.
- WF04 should normally run daily from the production queue, taking 3 queued Reel ideas plus the linked Story/captions package.
- Because user materials may be minimal, production should use a hybrid of competitor pattern, AI/stock/generated visuals, and user assets when available.
- Main visual target: premium product effect. Avoid cheap-looking AI output.
- May preserve competitor mechanics: hook mechanism, pacing, scene types, emotion, CTA formula.
- Must unique-ify: text, logos/brands, faces/people, and background/composition when too similar. Scene order does not always need changing if the winning mechanism depends on it.

QC must verify file exists and opens, vertical 9:16, readable text on phone, CTA exists, no copied logo/face/brand, strong first frame, and result does not look cheap.

If production fails, use a simplified format and/or create a "needs materials" task.

### WF05 - Package Delivery

WF05 should package and deliver assets to the user instead of publishing automatically.

- Deliver in Telegram and in a folder/storage location.
- Suggested folder structure:

```text
packages/YYYY-MM-DD/
  reels/reel_1.mp4
  reels/reel_2.mp4
  reels/reel_3.mp4
  story/story.mp4
  captions/captions.txt
  metadata/package.json
```

- Telegram message should include package summary, links/files, captions, CTA, scores, and source refs.
- Heavy files can be deleted after 30 days. Do not delete metadata, scores, feedback, source refs, or learning data.

### WF05.5 - Telegram Feedback Parser

Add a text-based Telegram control workflow. The user does not want buttons as the primary interface; the bot should understand natural Russian messages.

Examples it should understand:

- `опубликовал 1 и 3`
- `второй переделай, фон дешевый`
- `сторис слабая, сделай с вопросом`
- `пакет мусор`
- `все ок`
- `дай ссылки еще раз`

Workflow:

`Telegram Trigger -> determine package_id -> LLM parser through polza.ai -> validate parsed command -> switch intent -> update Supabase -> maybe trigger WF04 revision or WF06 analytics -> reply in Telegram`.

Supported intents: `published`, `revise`, `approve`, `reject`, `archive`, `ask_status`, `resend_links`.

If confidence is low or the action is destructive, ask for clarification/confirmation instead of acting silently.

Store feedback in a table such as `content_feedback` with raw message, parsed intent, target asset/package, tags, change request, and whether it was used for learning.

### WF06 - Analytics And Self-Learning

- Monitor one user account initially.
- Run every 3 days over the latest 21 videos.
- Every 2 weeks, analyze the latest 100 videos.
- Produce conclusions/report every 6 days, i.e. every second run.
- Collect all available stats.
- Success threshold: 5x average account performance.
- Extreme viral threshold: 20x average account performance; strongly orient future generation toward these patterns.
- If a video gets views even if the user dislikes it, treat it as viral success. Do not kill the viral pattern; optionally lower premium/brand score.
- If the user likes a video but it does not perform, use it as style guidance, not as a viral pattern.

WF06 should update hook weights, visual pattern weights, scenario structure weights, audio pattern weights, CTA weights, variant type weights (original/premium/viral), restrictions, and recommendations for WF03.

### Suggested Tables

Minimum table set for the redesign:

- `competitor_accounts`
- `competitor_videos`
- `competitor_video_analysis`
- `content_patterns`
- `pattern_recipes`
- `content_variants`
- `content_queue`
- `daily_packages`
- `package_assets`
- `content_feedback`
- `published_posts`
- `pattern_performance`

## Agent Runner Context

- The existing content-factory and agent-runner files were originally created by Claude.
- The project is now moving to Codex for ongoing work.
- Do not assume old Claude/GLM subagents are available in future Codex chats.
- Codex should analyze and edit the current repo/workflow files directly unless the user explicitly asks to use, repair, or restore agent-runner.
- Agent prompt files include `agent_02.md`, `agent_03.md`, `agent_03_5.md`, `agent_04.md`, and `agent_06.md`.

## Installed Tooling

- n8n skills installed into Codex:
  - `n8n-expression-syntax`
  - `n8n-node-configuration`
  - `n8n-validation-expert`
  - `n8n-workflow-patterns`
  - `n8n-code-javascript`
  - `n8n-code-python`
  - `n8n-mcp-tools-expert`
- `n8n-architect` skill installed from `EtienneLescot/n8n-as-code`.
- `valn8n` installed through `uv` with managed Python 3.13.
- `n8n-workflow-validator` installed as an isolated npm tool under `C:\Users\хост\.codex\tools\n8n-workflow-validator`.
- `n8nac` and `n8n-manager` installed as isolated npm tools under `C:\Users\хост\.codex\tools\n8n-as-code`.

## Validator Policy

Use `valn8n` and `n8n-workflow-validator` together as independent read-only checks:

- `valn8n`: structural/integrity preflight.
- `n8n-workflow-validator` / `n8n-validate`: n8n-specific node/parameter preflight.

Do not use either validator for automatic fixes unless the user explicitly asks. If the validators disagree, inspect the exact errors and confirm with n8n import/test execution.

Observed during install verification:

- `valn8n check workflows/WF01_pywG7APjXg3qUXfl.json` ran and reported 0 errors, 15 warnings, 12 hints.
- `n8n-workflow-validator` works on a minimal workflow but crashed on WF01 with a Fatal TypeError while reading node type metadata. Treat that as a validator limitation around unsupported/custom node definitions unless n8n import/test confirms a real workflow problem.

## Secrets Policy

- This tracked file must not contain credentials.
- Credentials may live in `.env`, `.project-secrets.local.md`, or the existing Claude project memory files.
- Do not print secret values in chat unless the user explicitly asks.
