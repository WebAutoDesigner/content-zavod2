# Content Factory Workflows Spec

This document defines the n8n workflow logic for the queue-based content factory.

Main principle:

```text
WF01-WF03.5 create and refill the idea queue.
WF04-WF05 produce and deliver daily packages from the queue.
WF05.5 receives user feedback.
WF06 learns from performance and updates future selection.
```

## Global Decisions

- All LLM and AI media calls go through polza.ai.
- Main brain model: `openai/gpt-5.2`.
- Transcription: `openai/gpt-4o-transcribe`; fallback `openai/whisper-1`.
- Image generation: `openai/gpt-image-1.5`.
- AI video: main `openai/sora-2`; fallback `google/veo3_fast`.
- Expensive premium video modes are disabled by default.
- Final rendering/montage is done by FFmpeg and Playwright render services, not by LLM.
- User publishes manually. The factory delivers finished assets and metadata.

## Queue Rules

- Normal scouting batch: about 50 competitor videos.
- Deep analysis:
  - take every video that passes strict selection;
  - minimum target: 10 videos;
  - if fewer than 10 pass, add the closest near-threshold videos by score;
  - if more than 10 pass, keep all genuinely strong videos.
- Queue refill trigger: fewer than 9 queued Reel ideas.
- Daily output:
  - 1 close-to-competitor Reel;
  - 1 premium Reel;
  - 1 viral Reel;
  - 1 Story;
  - 3 captions;
  - CTA;
  - source refs, pattern recipes, restrictions, score breakdown.

## WF00 - Queue Monitor

Purpose: decide when the factory should run a new analysis batch.

Trigger:

```text
Schedule, e.g. every morning
or manual Telegram/admin command
```

Steps:

1. Count rows in `content_queue` with status `queued` and format Reel.
2. If queued Reels >= 9, do nothing.
3. If queued Reels < 9, create a new row in `competitor_batches`.
4. Trigger WF01 with `batch_id`.

Reads:

```text
content_queue
```

Writes:

```text
competitor_batches
```

No LLM.

Failure handling:

- If Supabase count fails, send Telegram/admin error and stop.

## WF01 - Competitor Scouting

Purpose: collect competitor Instagram videos and select candidates for deeper analysis.

Trigger:

```text
ExecuteWorkflow from WF00 with batch_id
or manual trigger for testing
```

Input:

```text
batch_id
competitor account list from competitor_accounts
```

Steps:

1. Read active Instagram accounts from `competitor_accounts`.
2. Fetch recent Reels from competitors until about 50 videos are collected.
3. Normalize data:
   - URL;
   - shortcode;
   - account;
   - caption;
   - date;
   - thumbnail;
   - views;
   - likes;
   - comments;
   - saves/shares if available.
4. Calculate account-relative metrics:
   - account average views;
   - views multiplier;
   - engagement rate;
   - selection score.
5. Mark videos:
   - `strict` if they pass criteria;
   - `extreme_viral` if about 20x average;
   - `near_threshold` if close to criteria;
   - `rejected` if weak.
6. Select all strict/extreme videos.
7. If selected count is under 10, add nearest near-threshold videos until 10, if possible.
8. Save all found videos and selection labels.
9. Trigger WF01.5 for selected videos.

Selection criteria:

```text
top 20% inside account
or >= 2x account average views
or strong engagement
or extreme viral
```

Reads:

```text
competitor_accounts
```

Writes:

```text
competitor_videos
competitor_batches
```

No LLM.

Failure handling:

- If an account fails, mark account/batch warning and continue with other accounts.
- If fewer than 10 usable videos exist after all accounts, continue with available selected videos and mark `selection_notes`.

## WF01.5 - Video Preparation

Purpose: turn selected videos into structured raw material.

Trigger:

```text
ExecuteWorkflow from WF01
```

Input:

```text
batch_id
competitor_video_id
video_url
thumbnail_url
```

Steps per selected video:

1. Download/save original video to Supabase Storage.
2. FFmpeg extracts:
   - audio file;
   - keyframes;
   - preview if needed.
3. Transcribe audio through polza.ai:
   - model `openai/gpt-4o-transcribe`;
   - fallback `openai/whisper-1`.
4. Vision/OCR through polza.ai:
   - model `openai/gpt-5.2` when quality matters;
   - cheaper fallback can be tested later, but default brain remains `gpt-5.2`.
   - read screen text;
   - describe keyframes;
   - produce scene timeline.
5. Audio analysis:
   - BPM;
   - energy;
   - genre/mood;
   - drop timing if possible.
6. Save analysis.
7. Mark video as `ready_for_pattern`.
8. Trigger WF02 for ready videos.

Reads:

```text
competitor_videos
```

Writes:

```text
competitor_video_analysis
competitor_videos.status
Supabase Storage
```

LLM/AI:

```text
openai/gpt-4o-transcribe
openai/whisper-1 fallback
openai/gpt-5.2 for visual/OCR reasoning
```

Failure handling:

- If transcription fails but video has no/low speech, save `speech_transcript = ""` and continue.
- If one keyframe fails OCR, continue with remaining frames.
- If original video cannot be saved, mark video `failed` and do not pass to WF02.

## WF02 - Pattern Extraction

Purpose: explain why selected competitor videos worked and convert them into reusable recipes.

Trigger:

```text
ExecuteWorkflow from WF01.5
```

Input:

```text
competitor_video_id
competitor_video_analysis
performance metrics
```

Steps:

1. Load video metrics and full analysis.
2. Send structured analysis request to polza.ai `openai/gpt-5.2`.
3. Extract 9 layers:
   - hook pattern;
   - visual pattern;
   - scenario pattern;
   - retention pattern;
   - desire trigger;
   - proof pattern;
   - audio pattern;
   - CTA pattern;
   - adaptation recipe.
4. Identify:
   - what to keep;
   - what to change;
   - what not to copy;
   - logos/brands/faces/exact text/copyright risks.
5. Score pattern:
   - virality;
   - premium feel;
   - similarity usefulness;
   - production feasibility.
6. Save `content_patterns`.
7. Save one or more `pattern_recipes`.
8. When enough patterns in batch are done, trigger WF03.

Reads:

```text
competitor_videos
competitor_video_analysis
```

Writes:

```text
content_patterns
pattern_recipes
competitor_videos.status
```

LLM:

```text
openai/gpt-5.2
```

Failure handling:

- If JSON parse fails, retry once with "repair JSON only".
- If model output is generic, mark pattern low score and do not create queue-ready recipe.

## WF03 - Variant Factory

Purpose: generate a bank of content ideas from extracted patterns.

Trigger:

```text
ExecuteWorkflow from WF02 after batch pattern extraction
or manual trigger for a specific batch
```

Input:

```text
batch_id
pattern_recipes
content_patterns
```

Steps:

1. Load usable pattern recipes for the batch.
2. For each strong recipe, generate 12 Reel variants:
   - 4 close to competitor;
   - 4 more viral;
   - 4 more premium.
3. Generate linked Story variants.
4. Generate captions and CTA options.
5. For each variant, save:
   - first frame;
   - hook text;
   - screen text;
   - scene plan;
   - source refs;
   - borrowed elements;
   - changed elements;
   - forbidden checks.
6. Save all variants, including weaker ones.
7. Trigger WF03.5.

Reads:

```text
content_patterns
pattern_recipes
```

Writes:

```text
content_variants
```

LLM:

```text
openai/gpt-5.2
```

Failure handling:

- If a generated variant lacks a concrete first frame or scene plan, mark it rejected or retry once.
- If variant copies exact text/logo/brand, mark rejected before scoring.

## WF03.5 - Scoring And Queue Admission

Purpose: score variants and fill the production queue.

Trigger:

```text
ExecuteWorkflow from WF03
```

Input:

```text
content_variants for batch
```

Steps:

1. Score all variants with `openai/gpt-5.2`.
2. Score dimensions:
   - virality;
   - similarity to successful pattern;
   - first-frame strength;
   - retention potential;
   - lead/interest potential;
   - production feasibility;
   - uniqueness/safety.
3. Auto-block:
   - weak first frame;
   - generic scenario;
   - too far from successful source pattern;
   - copied logo/brand/face/text not adapted;
   - cannot be produced.
4. Approve strong variants into `content_queue`.
5. Preserve group balance:
   - close;
   - premium;
   - viral;
   - story.
6. Assign `production_mode`:
   - `montage`;
   - `ai_video`;
   - `hybrid`;
   - `story_template`.
7. Update batch status.

Reads:

```text
content_variants
content_patterns
pattern_recipes
```

Writes:

```text
content_variants.status
content_queue
competitor_batches
```

LLM:

```text
openai/gpt-5.2
```

Failure handling:

- If not enough variants pass, lower threshold only for near-pass variants, not random content.
- If no variants pass, mark batch failed and notify user/admin.

## WF04 - Daily Production

Purpose: create finished Reels and Story from the queue.

Trigger:

```text
Schedule daily
or manual Telegram/admin command
```

Input:

```text
content_queue queued items
```

Steps:

1. Select daily package:
   - 1 close Reel;
   - 1 premium Reel;
   - 1 viral Reel;
   - 1 Story.
2. Lock selected queue rows as `in_production`.
3. Create `daily_packages` row with status `in_production`.
4. For each Reel, decide production path:
   - montage through FFmpeg/Playwright;
   - AI video through `openai/sora-2`;
   - fallback `google/veo3_fast`;
   - hybrid if AI creates only a key scene.
5. Use `openai/gpt-5.2` for production direction:
   - exact shot list;
   - prompt for image/video;
   - overlay text;
   - music/energy instruction;
   - CTA placement.
6. Generate needed images through `openai/gpt-image-1.5`.
7. Generate AI video if needed through `openai/sora-2`.
8. Render final vertical 9:16 through FFmpeg/Playwright.
9. QC each file:
   - exists;
   - opens;
   - 9:16;
   - readable text;
   - strong first frame;
   - no copied logo/brand/face;
   - CTA present;
   - does not look cheap.
10. Save assets.
11. Trigger WF05.

Reads:

```text
content_queue
content_variants
pattern_recipes
daily_packages
```

Writes:

```text
daily_packages
package_assets
content_queue.status
Supabase Storage
```

AI/tools:

```text
openai/gpt-5.2
openai/gpt-image-1.5
openai/sora-2
google/veo3_fast fallback
FFmpeg render server
Playwright render server
```

Failure handling:

- If Sora fails once, retry once.
- If Sora fails twice, try `google/veo3_fast`.
- If AI video still fails, switch the item to montage/hybrid.
- Do not keep burning premium video calls.
- If one Reel fails, still produce deliverable package when possible and mark failed item for revision.

## WF05 - Package Delivery

Purpose: deliver finished package to the user in Telegram and storage.

Trigger:

```text
ExecuteWorkflow from WF04
```

Input:

```text
daily_package_id
package_assets
captions
CTA
score breakdown
source refs
```

Steps:

1. Load finished assets.
2. Upload/store final files if not already in Storage.
3. Build Telegram message:
   - 3 Reels;
   - 1 Story;
   - 3 captions;
   - CTA;
   - source refs;
   - score summary.
4. Send to user Telegram.
5. Save Telegram message IDs.
6. Mark package `delivered`.

Reads:

```text
daily_packages
package_assets
content_queue
```

Writes:

```text
daily_packages.status
package_assets.storage_url
```

No LLM required.

Failure handling:

- If Telegram upload fails because file is too large, send storage links.
- If one asset fails to send, send remaining assets and mark partial delivery.

## WF05.5 - Telegram Feedback Parser

Purpose: understand user's natural Russian messages and route actions.

Trigger:

```text
Telegram Trigger
```

Input examples:

```text
опубликовал 1 и 3
второй переделай, фон дешевый
сторис слабая, сделай с вопросом
пакет мусор
все ок
дай ссылки еще раз
```

Steps:

1. Identify latest or referenced package.
2. Send raw message and package context to polza.ai `openai/gpt-5.2`.
3. Parse:
   - intent;
   - target package;
   - target asset;
   - change request;
   - confidence.
4. Validate parsed command.
5. If confidence low or destructive, ask clarification.
6. Route intent:
   - `published`: update `published_posts` and package/asset status;
   - `revise`: create revision request and trigger WF04 for selected asset;
   - `approve`: store positive feedback;
   - `reject`: store negative feedback;
   - `archive`: archive package if confirmed;
   - `ask_status`: return status;
   - `resend_links`: resend package.
7. Store feedback.

Reads:

```text
daily_packages
package_assets
content_queue
```

Writes:

```text
content_feedback
published_posts
daily_packages.status
content_queue.status
```

LLM:

```text
openai/gpt-5.2
```

Failure handling:

- If package cannot be identified, ask user which package/date.
- If user message conflicts with stored state, ask clarification.

## WF06 - Analytics And Self-Learning

Purpose: learn from published content and update future scoring.

Trigger:

```text
Schedule:
every 3 days for latest 21 posts
every 2 weeks for latest 100 posts
every 6 days produce conclusions/report
```

Input:

```text
published_posts
Instagram/account analytics
content_patterns
pattern_recipes
content_feedback
```

Steps:

1. Fetch published post analytics.
2. Update `published_posts` metrics.
3. Calculate:
   - views multiplier vs account average;
   - engagement score;
   - lead score if available.
4. Classify:
   - `successful_x5`;
   - `extreme_x20`;
   - normal;
   - weak.
5. Link performance back to:
   - source competitor video;
   - pattern;
   - recipe;
   - variant group;
   - production mode.
6. Use `openai/gpt-5.2` to create learning conclusions:
   - which hooks to increase;
   - which visual patterns to repeat;
   - which CTA styles work;
   - whether close/premium/viral group performed best;
   - what not to repeat.
7. Save `pattern_performance`.
8. Update future weights/scores used by WF03.5.
9. Every second run, send concise strategy report to Telegram.

Reads:

```text
published_posts
content_patterns
pattern_recipes
content_variants
content_queue
content_feedback
```

Writes:

```text
published_posts
pattern_performance
pattern_recipes score/weight fields
content_patterns score/weight fields
```

LLM:

```text
openai/gpt-5.2
```

Failure handling:

- If analytics access fails, keep previous metrics and notify user/admin.
- If a post has incomplete metrics, do not classify as failed too early.
- If user dislikes a viral post, keep viral learning but lower style/premium preference.

## Error And Retry Principles

- Do not fail the whole batch because one competitor account/video fails.
- Keep failed rows with clear status and error note.
- Retry LLM JSON parse once with a repair prompt.
- Retry AI video only a limited number of times.
- Store rejected ideas and failed attempts because they are useful for learning.
- Never delete learning metadata, source refs, scores, feedback, or performance data.

## Build Order

Recommended implementation order:

```text
1. Supabase schema and buckets
2. WF00 queue monitor
3. WF01 competitor scouting
4. WF01.5 video preparation
5. WF02 pattern extraction
6. WF03 variant factory
7. WF03.5 queue admission
8. WF04 daily production
9. WF05 delivery
10. WF05.5 feedback parser
11. WF06 analytics learning
```
