-- Content Factory queue-based schema for Supabase/Postgres.
-- Safe to run multiple times where possible.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.competitor_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram',
  account_url text not null,
  username text,
  display_name text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived', 'error')),
  priority integer not null default 100,
  last_scanned_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, account_url)
);

create table if not exists public.competitor_batches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'started' check (status in ('started', 'scouting_done', 'selection_done', 'analysis_started', 'completed', 'failed')),
  platform text not null default 'instagram',
  target_video_count integer not null default 50,
  found_video_count integer not null default 0,
  strict_selected_count integer not null default 0,
  near_threshold_selected_count integer not null default 0,
  final_selected_count integer not null default 0,
  selection_notes text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competitor_videos (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.competitor_batches(id) on delete set null,
  competitor_account_id uuid references public.competitor_accounts(id) on delete set null,
  platform text not null default 'instagram',
  video_url text not null,
  shortcode text,
  caption text,
  published_at timestamptz,
  thumbnail_url text,
  raw_video_storage_path text,
  views bigint,
  likes bigint,
  comments bigint,
  saves bigint,
  shares bigint,
  followers_at_scan bigint,
  account_average_views numeric,
  views_multiplier numeric,
  engagement_rate numeric,
  selection_score numeric,
  selection_reason text,
  selection_type text not null default 'rejected' check (selection_type in ('strict', 'near_threshold', 'rejected', 'extreme_viral', 'manual')),
  status text not null default 'found' check (status in ('found', 'qualified', 'near_threshold', 'rejected', 'raw_saved', 'transcript_done', 'visual_done', 'audio_done', 'ready_for_pattern', 'pattern_extracted', 'archived', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, video_url)
);

create table if not exists public.competitor_video_analysis (
  id uuid primary key default gen_random_uuid(),
  competitor_video_id uuid not null references public.competitor_videos(id) on delete cascade,
  audio_storage_path text,
  keyframes_storage_paths jsonb not null default '[]'::jsonb,
  preview_storage_path text,
  speech_transcript text,
  speech_segments_json jsonb not null default '[]'::jsonb,
  screen_text_json jsonb not null default '[]'::jsonb,
  scene_timeline_json jsonb not null default '[]'::jsonb,
  visual_summary text,
  audio_bpm numeric,
  audio_energy numeric,
  audio_genre text,
  audio_drop_seconds numeric,
  ocr_confidence numeric,
  transcription_model text,
  vision_model text,
  audio_analysis_tool text,
  status text not null default 'pending' check (status in ('pending', 'transcript_done', 'visual_done', 'audio_done', 'ready_for_pattern', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_patterns (
  id uuid primary key default gen_random_uuid(),
  competitor_video_id uuid references public.competitor_videos(id) on delete set null,
  batch_id uuid references public.competitor_batches(id) on delete set null,
  hook_pattern text,
  visual_pattern text,
  scenario_pattern text,
  retention_pattern text,
  desire_trigger text,
  proof_pattern text,
  audio_pattern text,
  cta_pattern text,
  adaptation_recipe text,
  forbidden_elements_json jsonb not null default '[]'::jsonb,
  caution_elements_json jsonb not null default '[]'::jsonb,
  pattern_score numeric,
  virality_score numeric,
  premium_score numeric,
  similarity_score numeric,
  model_used text not null default 'openai/gpt-5.2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pattern_recipes (
  id uuid primary key default gen_random_uuid(),
  content_pattern_id uuid references public.content_patterns(id) on delete cascade,
  recipe_type text not null check (recipe_type in ('close_to_competitor', 'more_viral', 'more_premium', 'story')),
  title text,
  first_frame_formula text,
  scene_formula_json jsonb not null default '[]'::jsonb,
  screen_text_formula text,
  audio_formula text,
  cta_formula text,
  what_to_keep_json jsonb not null default '[]'::jsonb,
  what_to_change_json jsonb not null default '[]'::jsonb,
  what_not_to_copy_json jsonb not null default '[]'::jsonb,
  usable_for_products_json jsonb not null default '[]'::jsonb,
  score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_variants (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.competitor_batches(id) on delete set null,
  pattern_recipe_id uuid references public.pattern_recipes(id) on delete set null,
  content_pattern_id uuid references public.content_patterns(id) on delete set null,
  source_competitor_video_id uuid references public.competitor_videos(id) on delete set null,
  variant_group text not null check (variant_group in ('close', 'viral', 'premium', 'story')),
  variant_number integer,
  format text not null check (format in ('reel', 'story', 'caption')),
  first_frame text,
  hook_text text,
  screen_text_json jsonb not null default '[]'::jsonb,
  scene_plan_json jsonb not null default '[]'::jsonb,
  caption text,
  cta text,
  source_refs_json jsonb not null default '[]'::jsonb,
  borrowed_elements_json jsonb not null default '[]'::jsonb,
  changed_elements_json jsonb not null default '[]'::jsonb,
  forbidden_checks_json jsonb not null default '[]'::jsonb,
  generation_model text not null default 'openai/gpt-5.2',
  status text not null default 'idea_created' check (status in ('idea_created', 'scored', 'rejected', 'approved_for_queue', 'queued', 'in_production', 'produced', 'delivered', 'published', 'performance_checked', 'learned', 'archived')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_queue (
  id uuid primary key default gen_random_uuid(),
  content_variant_id uuid not null references public.content_variants(id) on delete cascade,
  batch_id uuid references public.competitor_batches(id) on delete set null,
  queue_position integer,
  queue_group text not null check (queue_group in ('close', 'viral', 'premium', 'story')),
  priority_score numeric,
  virality_score numeric,
  premium_score numeric,
  similarity_score numeric,
  first_frame_score numeric,
  retention_score numeric,
  lead_score numeric,
  production_mode text not null default 'montage' check (production_mode in ('montage', 'ai_video', 'hybrid', 'story_template')),
  status text not null default 'queued' check (status in ('approved_for_queue', 'queued', 'in_production', 'produced', 'delivered', 'published', 'performance_checked', 'learned', 'archived', 'failed')),
  planned_for_date date,
  locked_at timestamptz,
  produced_at timestamptz,
  delivered_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_packages (
  id uuid primary key default gen_random_uuid(),
  package_date date not null default current_date,
  status text not null default 'planned' check (status in ('planned', 'in_production', 'ready', 'delivered', 'partially_published', 'published', 'needs_revision', 'archived', 'failed')),
  reel_close_queue_id uuid references public.content_queue(id) on delete set null,
  reel_premium_queue_id uuid references public.content_queue(id) on delete set null,
  reel_viral_queue_id uuid references public.content_queue(id) on delete set null,
  story_queue_id uuid references public.content_queue(id) on delete set null,
  cta text,
  selection_notes text,
  score_breakdown_json jsonb not null default '{}'::jsonb,
  source_refs_json jsonb not null default '[]'::jsonb,
  telegram_message_id text,
  folder_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.package_assets (
  id uuid primary key default gen_random_uuid(),
  daily_package_id uuid not null references public.daily_packages(id) on delete cascade,
  content_queue_id uuid references public.content_queue(id) on delete set null,
  asset_type text not null check (asset_type in ('reel_close', 'reel_premium', 'reel_viral', 'story', 'caption_file', 'metadata')),
  file_path text,
  storage_url text,
  thumbnail_url text,
  duration_seconds numeric,
  resolution text,
  production_mode text check (production_mode in ('montage', 'ai_video', 'hybrid', 'story_template')),
  render_tool text check (render_tool in ('ffmpeg', 'playwright', 'polza_sora_2', 'polza_veo3_fast', 'hybrid')),
  ai_video_model text,
  image_model text,
  music_source text,
  caption text,
  cta text,
  qc_status text not null default 'pending' check (qc_status in ('pending', 'passed', 'failed', 'warning')),
  qc_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_feedback (
  id uuid primary key default gen_random_uuid(),
  daily_package_id uuid references public.daily_packages(id) on delete set null,
  package_asset_id uuid references public.package_assets(id) on delete set null,
  raw_message text not null,
  parsed_intent text check (parsed_intent in ('published', 'revise', 'approve', 'reject', 'archive', 'ask_status', 'resend_links')),
  target_asset_type text,
  target_index integer,
  change_request text,
  feedback_tags_json jsonb not null default '[]'::jsonb,
  parser_model text not null default 'openai/gpt-5.2',
  parser_confidence numeric,
  used_for_learning boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.published_posts (
  id uuid primary key default gen_random_uuid(),
  daily_package_id uuid references public.daily_packages(id) on delete set null,
  package_asset_id uuid references public.package_assets(id) on delete set null,
  platform text not null default 'instagram',
  post_url text,
  published_at timestamptz,
  user_reported_published_at timestamptz,
  views bigint,
  likes bigint,
  comments bigint,
  saves bigint,
  shares bigint,
  reach bigint,
  profile_visits bigint,
  leads bigint,
  account_average_views_at_check numeric,
  views_multiplier numeric,
  success_level text not null default 'unknown' check (success_level in ('unknown', 'weak', 'normal', 'successful_x5', 'extreme_x20')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pattern_performance (
  id uuid primary key default gen_random_uuid(),
  content_pattern_id uuid references public.content_patterns(id) on delete set null,
  pattern_recipe_id uuid references public.pattern_recipes(id) on delete set null,
  published_post_id uuid references public.published_posts(id) on delete cascade,
  variant_group text check (variant_group in ('close', 'viral', 'premium', 'story')),
  production_mode text check (production_mode in ('montage', 'ai_video', 'hybrid', 'story_template')),
  views_multiplier numeric,
  engagement_score numeric,
  lead_score numeric,
  user_feedback_score numeric,
  learning_result text check (learning_result in ('increase_weight', 'decrease_weight', 'keep', 'do_not_use', 'style_only', 'viral_success_user_disliked')),
  weight_delta numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_competitor_accounts_status on public.competitor_accounts(status);
create index if not exists idx_competitor_batches_status on public.competitor_batches(status);
create index if not exists idx_competitor_videos_batch on public.competitor_videos(batch_id);
create index if not exists idx_competitor_videos_status on public.competitor_videos(status);
create index if not exists idx_competitor_videos_selection on public.competitor_videos(selection_type, selection_score desc);
create index if not exists idx_competitor_video_analysis_video on public.competitor_video_analysis(competitor_video_id);
create index if not exists idx_content_patterns_batch on public.content_patterns(batch_id);
create index if not exists idx_pattern_recipes_pattern on public.pattern_recipes(content_pattern_id);
create index if not exists idx_content_variants_batch_status on public.content_variants(batch_id, status);
create index if not exists idx_content_variants_group on public.content_variants(variant_group, status);
create index if not exists idx_content_queue_status_group on public.content_queue(status, queue_group, priority_score desc);
create index if not exists idx_content_queue_planned_date on public.content_queue(planned_for_date);
create index if not exists idx_daily_packages_date_status on public.daily_packages(package_date, status);
create index if not exists idx_package_assets_package on public.package_assets(daily_package_id);
create index if not exists idx_content_feedback_package on public.content_feedback(daily_package_id);
create index if not exists idx_published_posts_platform_date on public.published_posts(platform, published_at);
create index if not exists idx_pattern_performance_pattern on public.pattern_performance(content_pattern_id, pattern_recipe_id);

drop trigger if exists trg_competitor_accounts_updated_at on public.competitor_accounts;
create trigger trg_competitor_accounts_updated_at
before update on public.competitor_accounts
for each row execute function public.set_updated_at();

drop trigger if exists trg_competitor_batches_updated_at on public.competitor_batches;
create trigger trg_competitor_batches_updated_at
before update on public.competitor_batches
for each row execute function public.set_updated_at();

drop trigger if exists trg_competitor_videos_updated_at on public.competitor_videos;
create trigger trg_competitor_videos_updated_at
before update on public.competitor_videos
for each row execute function public.set_updated_at();

drop trigger if exists trg_competitor_video_analysis_updated_at on public.competitor_video_analysis;
create trigger trg_competitor_video_analysis_updated_at
before update on public.competitor_video_analysis
for each row execute function public.set_updated_at();

drop trigger if exists trg_content_patterns_updated_at on public.content_patterns;
create trigger trg_content_patterns_updated_at
before update on public.content_patterns
for each row execute function public.set_updated_at();

drop trigger if exists trg_pattern_recipes_updated_at on public.pattern_recipes;
create trigger trg_pattern_recipes_updated_at
before update on public.pattern_recipes
for each row execute function public.set_updated_at();

drop trigger if exists trg_content_variants_updated_at on public.content_variants;
create trigger trg_content_variants_updated_at
before update on public.content_variants
for each row execute function public.set_updated_at();

drop trigger if exists trg_content_queue_updated_at on public.content_queue;
create trigger trg_content_queue_updated_at
before update on public.content_queue
for each row execute function public.set_updated_at();

drop trigger if exists trg_daily_packages_updated_at on public.daily_packages;
create trigger trg_daily_packages_updated_at
before update on public.daily_packages
for each row execute function public.set_updated_at();

drop trigger if exists trg_package_assets_updated_at on public.package_assets;
create trigger trg_package_assets_updated_at
before update on public.package_assets
for each row execute function public.set_updated_at();

drop trigger if exists trg_published_posts_updated_at on public.published_posts;
create trigger trg_published_posts_updated_at
before update on public.published_posts
for each row execute function public.set_updated_at();

drop trigger if exists trg_pattern_performance_updated_at on public.pattern_performance;
create trigger trg_pattern_performance_updated_at
before update on public.pattern_performance
for each row execute function public.set_updated_at();

-- RLS is enabled so tables are not accidentally public.
-- n8n should use the Supabase service role key.
alter table public.competitor_accounts enable row level security;
alter table public.competitor_batches enable row level security;
alter table public.competitor_videos enable row level security;
alter table public.competitor_video_analysis enable row level security;
alter table public.content_patterns enable row level security;
alter table public.pattern_recipes enable row level security;
alter table public.content_variants enable row level security;
alter table public.content_queue enable row level security;
alter table public.daily_packages enable row level security;
alter table public.package_assets enable row level security;
alter table public.content_feedback enable row level security;
alter table public.published_posts enable row level security;
alter table public.pattern_performance enable row level security;

-- Storage buckets. Supabase may require these inserts to run as service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('competitors', 'competitors', false, 524288000, array['video/mp4', 'audio/wav', 'audio/mpeg', 'image/jpeg', 'image/png']),
  ('packages', 'packages', false, 524288000, array['video/mp4', 'image/jpeg', 'image/png', 'text/plain', 'application/json'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
