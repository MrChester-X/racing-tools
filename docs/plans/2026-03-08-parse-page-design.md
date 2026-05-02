# Parse Page Design

## Overview

New `/parse` page — single-page interface for parsing race results (like Telegram bot) and processing video with Remotion overlays.

## Frontend (`/parse`)

### Upper Section — Race Parsing
- URL input field for race link (timing.batyrshin.name)
- "Load" button → `GET /parser/race`
- Driver dropdown selector
- Statistics block (same as Telegram): top 5 best/median/worst laps, last 3, all laps

### Middle Section — Video Editor
- Drag & drop / file input for video upload
- HTML5 `<video>` player with frame-by-frame navigation (+/- frame buttons)
- Three timeline sliders: offset (lap timing start), trim start, trim end
- Preview of trimmed fragment (play selected range)
- "Submit for processing" button → presigned URL → direct S3 upload → create job

### Lower Section — Jobs List
- Cards/table of video_jobs: status (pending/processing/done/error), date, driver
- Polling every 5 seconds for status updates
- Click → modal with source data (URL, driver, offset, timecodes) + "Download" button (presigned S3 URL)

## Backend (New Endpoints)

- `GET /parser/race` — existing, reuse
- `POST /video-jobs/presign-upload` — returns presigned PUT URL for S3
- `POST /video-jobs` — creates job (s3 key, race_url, driver, offset, trim_start, trim_end, race_data)
- `GET /video-jobs` — list all jobs
- `GET /video-jobs/:id` — details + presigned download URL

## Database — `video_jobs` Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| race_url | string | Race timing URL |
| driver_name | string | Selected driver |
| offset | float | Lap timing offset |
| trim_start | float | Video trim start |
| trim_end | float | Video trim end |
| source_video_s3_key | string | Source video S3 key |
| result_video_s3_key | string (nullable) | Result video S3 key |
| status | enum | pending/processing/done/error |
| error_message | string (nullable) | Error details |
| race_data | jsonb (nullable) | Parsed race statistics |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last update time |

## Processing Pipeline

```
Upload video → S3 (direct via presigned URL) → Create job (status: pending)
  → Background worker picks up pending job
  → Remotion Lambda renders final video (source video + overlay + trim)
  → Result uploaded to S3 by Remotion
  → Job status → done, result_video_s3_key set
```

No FFmpeg — everything through Remotion Lambda. May need to increase Lambda timeout for longer videos.

## Tech Stack

- Frontend: Next.js 15 + React 19 + Tailwind + Zustand
- Backend: NestJS + TypeORM + PostgreSQL
- Video: Remotion Lambda (full render — source + overlay + trim)
- Storage: AWS S3 (direct upload via presigned URLs)
- Status updates: Polling (5s interval)
