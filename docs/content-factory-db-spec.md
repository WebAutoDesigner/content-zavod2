# Content Factory DB Spec

This document defines the queue-based data model for the redesigned content factory.

Core loop:

```text
competitor batch -> selected videos -> video analysis -> patterns -> variants -> queue -> daily package -> delivery -> publication feedback -> performance learning
```

SQL migration file:

```text
supabase/content_factory_schema.sql
```

## Batch Rules

- Normal competitor scouting batch: about 50 competitor videos.
- Deep analysis selection:
  - take all videos that pass strict criteria;
  - minimum target: 10 videos when enough usable material exists;
  - if fewer than 10 pass strict criteria, fill remaining slots with the closest near-threshold videos by score;
  - do not cap at 10 if more videos are genuinely strong.
- Production queue refill trigger: when fewer than 9 Reel ideas remain queued.
- Daily output: 3 Reels, 1 Story, 3 captions, CTA, source references, pattern recipes, restrictions, score breakdown.

## Status Flow

### Competitor Video

```text
found
qualified
near_threshold
rejected
raw_saved
transcript_done
visual_done
audio_done
ready_for_pattern
pattern_extracted
archived
```

### Content Variant

```text
idea_created
scored
rejected
approved_for_queue
queued
in_production
produced
delivered
published
performance_checked
learned
archived
```

### Daily Package

```text
planned
in_production
ready
delivered
partially_published
published
needs_revision
archived
```

## Tables

## `competitor_accounts`

Stores competitor Instagram accounts.

Important fields:

```text
id
platform
account_url
username
display_name
status
priority
last_scanned_at
notes
created_at
updated_at
```

Recommended statuses:

```text
active
paused
archived
error
```

## `competitor_batches`

One row per scouting batch.

Important fields:

```text
id
status
platform
target_video_count
found_video_count
strict_selected_count
near_threshold_selected_count
final_selected_count
selection_notes
started_at
finished_at
created_at
updated_at
```

Recommended statuses:

```text
started
scouting_done
selection_done
analysis_started
completed
failed
```

## `competitor_videos`

One row per competitor video.

Important fields:

```text
id
batch_id
competitor_account_id
platform
video_url
shortcode
caption
published_at
thumbnail_url
raw_video_storage_path
views
likes
comments
saves
shares
followers_at_scan
account_average_views
views_multiplier
engagement_rate
selection_score
selection_reason
selection_type
status
created_at
updated_at
```

`selection_type`:

```text
strict
near_threshold
rejected
extreme_viral
manual
```

Important rule: external logos, visible brand marks, or partial human presence are not automatic rejection reasons. They are adaptation risks for later workflows.

## `competitor_video_analysis`

Technical and raw AI analysis of selected videos.

Important fields:

```text
id
competitor_video_id
audio_storage_path
keyframes_storage_paths
preview_storage_path
speech_transcript
speech_segments_json
screen_text_json
scene_timeline_json
visual_summary
audio_bpm
audio_energy
audio_genre
audio_drop_seconds
ocr_confidence
transcription_model
vision_model
audio_analysis_tool
status
created_at
updated_at
```

Recommended status:

```text
pending
transcript_done
visual_done
audio_done
ready_for_pattern
failed
```

## `content_patterns`

Stores extracted reasons why a competitor video worked.

Important fields:

```text
id
competitor_video_id
batch_id
hook_pattern
visual_pattern
scenario_pattern
retention_pattern
desire_trigger
proof_pattern
audio_pattern
cta_pattern
adaptation_recipe
forbidden_elements_json
caution_elements_json
pattern_score
virality_score
premium_score
similarity_score
model_used
created_at
updated_at
```

Main model:

```text
openai/gpt-5.2
```

## `pattern_recipes`

Reusable production recipes derived from patterns.

Important fields:

```text
id
content_pattern_id
recipe_type
title
first_frame_formula
scene_formula_json
screen_text_formula
audio_formula
cta_formula
what_to_keep_json
what_to_change_json
what_not_to_copy_json
usable_for_products_json
score
created_at
updated_at
```

`recipe_type`:

```text
close_to_competitor
more_viral
more_premium
story
```

## `content_variants`

Stores all generated variants, including rejected ones.

Important fields:

```text
id
batch_id
pattern_recipe_id
content_pattern_id
source_competitor_video_id
variant_group
variant_number
format
first_frame
hook_text
screen_text_json
scene_plan_json
caption
cta
source_refs_json
borrowed_elements_json
changed_elements_json
forbidden_checks_json
generation_model
status
created_at
updated_at
```

`variant_group`:

```text
close
viral
premium
story
```

`format`:

```text
reel
story
caption
```

Main model:

```text
openai/gpt-5.2
```

## `content_queue`

The production queue. This is the key table for the new batch-based system.

Important fields:

```text
id
content_variant_id
batch_id
queue_position
queue_group
priority_score
virality_score
premium_score
similarity_score
first_frame_score
retention_score
lead_score
production_mode
status
planned_for_date
locked_at
produced_at
delivered_at
published_at
created_at
updated_at
```

`queue_group`:

```text
close
viral
premium
story
```

`production_mode`:

```text
montage
ai_video
hybrid
story_template
```

Queue rules:

- Daily package should normally pull:
  - 1 queued `close` Reel;
  - 1 queued `premium` Reel;
  - 1 queued `viral` Reel;
  - 1 linked Story.
- If one group is empty, use the next highest score, but mark the reason in `daily_packages.selection_notes`.

## `daily_packages`

One row per delivered daily package.

Important fields:

```text
id
package_date
status
reel_close_queue_id
reel_premium_queue_id
reel_viral_queue_id
story_queue_id
cta
selection_notes
score_breakdown_json
source_refs_json
telegram_message_id
folder_path
created_at
updated_at
```

## `package_assets`

Stores final files and metadata.

Important fields:

```text
id
daily_package_id
content_queue_id
asset_type
file_path
storage_url
thumbnail_url
duration_seconds
resolution
production_mode
render_tool
ai_video_model
image_model
music_source
caption
cta
qc_status
qc_notes
created_at
updated_at
```

`asset_type`:

```text
reel_close
reel_premium
reel_viral
story
caption_file
metadata
```

Render tools:

```text
ffmpeg
playwright
polza_sora_2
polza_veo3_fast
hybrid
```

## `content_feedback`

Stores user Telegram feedback and parsed commands.

Important fields:

```text
id
daily_package_id
package_asset_id
raw_message
parsed_intent
target_asset_type
target_index
change_request
feedback_tags_json
parser_model
parser_confidence
used_for_learning
created_at
```

Supported intents:

```text
published
revise
approve
reject
archive
ask_status
resend_links
```

Parser model:

```text
openai/gpt-5.2
```

## `published_posts`

Stores what the user says was published and later analytics.

Important fields:

```text
id
daily_package_id
package_asset_id
platform
post_url
published_at
user_reported_published_at
views
likes
comments
saves
shares
reach
profile_visits
leads
account_average_views_at_check
views_multiplier
success_level
last_checked_at
created_at
updated_at
```

`success_level`:

```text
unknown
weak
normal
successful_x5
extreme_x20
```

## `pattern_performance`

Stores learning results per pattern/recipe.

Important fields:

```text
id
content_pattern_id
pattern_recipe_id
published_post_id
variant_group
production_mode
views_multiplier
engagement_score
lead_score
user_feedback_score
learning_result
weight_delta
notes
created_at
updated_at
```

`learning_result`:

```text
increase_weight
decrease_weight
keep
do_not_use
style_only
viral_success_user_disliked
```

## Storage Layout

Recommended Supabase Storage structure:

```text
competitors/{batch_id}/{video_id}/original.mp4
competitors/{batch_id}/{video_id}/audio.wav
competitors/{batch_id}/{video_id}/keyframes/frame_001.jpg
competitors/{batch_id}/{video_id}/preview.mp4

packages/{YYYY-MM-DD}/{package_id}/reels/reel_close.mp4
packages/{YYYY-MM-DD}/{package_id}/reels/reel_premium.mp4
packages/{YYYY-MM-DD}/{package_id}/reels/reel_viral.mp4
packages/{YYYY-MM-DD}/{package_id}/story/story.mp4
packages/{YYYY-MM-DD}/{package_id}/captions/captions.txt
packages/{YYYY-MM-DD}/{package_id}/metadata/package.json
```

Heavy files can be deleted after 30 days. Keep metadata, scores, source refs, feedback, and performance learning.

## Model Map

All AI calls should go through polza.ai.

```text
Main brain:
openai/gpt-5.2

Transcription:
openai/gpt-4o-transcribe
fallback: openai/whisper-1

Images:
openai/gpt-image-1.5
alternative test: google/gemini-3.1-flash-image-preview

AI video:
main: openai/sora-2
fallback: google/veo3_fast

Do not use by default:
openai/sora-2-pro
google/veo3
```

## Workflow Ownership

```text
WF01:
competitor_accounts, competitor_batches, competitor_videos

WF01.5:
competitor_video_analysis, Supabase Storage

WF02:
content_patterns, pattern_recipes

WF03:
content_variants

WF03.5:
content_queue, score breakdowns

WF04:
package_assets, daily_packages status updates

WF05:
delivery through Telegram and folder/storage

WF05.5:
content_feedback, revision triggers

WF06:
published_posts, pattern_performance, queue/recipe weight updates
```
