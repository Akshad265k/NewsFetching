# Vartta Kosha

[![Next.js](https://img.shields.io/badge/Next.js-App%20Router-111111?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/docs)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/docs)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-UI-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/docs)
[![pnpm](https://img.shields.io/badge/pnpm-Workspace-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![PDF Pipeline](https://img.shields.io/badge/PDF-Pipeline-CC2936?style=for-the-badge&logo=adobeacrobatreader&logoColor=white)](#pdf-generation-mechanism)
[![Languages](https://img.shields.io/badge/Languages-14-brightgreen?style=for-the-badge)](#language-coverage)

A production-oriented newspaper retrieval and PDF assembly platform focused on Indian newspaper editions from TradingRef live data.

The application allows a user to:

1. Select a date.
2. Select language, newspaper, and edition.
3. Generate a consolidated PDF from mixed source content (image pages, direct PDFs, and locked PDFs).
4. Download the generated result in-browser.

## Table of Contents

1. [System Purpose](#system-purpose)
2. [High-Level Architecture](#high-level-architecture)
3. [End-to-End User Flow](#end-to-end-user-flow)
4. [PDF Generation Mechanism](#pdf-generation-mechanism)
5. [Data Model and Decryption](#data-model-and-decryption)
6. [API Surface](#api-surface)
7. [Reliability and Safety Layers](#reliability-and-safety-layers)
8. [Frontend Interaction Model](#frontend-interaction-model)
9. [Language Coverage](#language-coverage)
10. [Project Structure](#project-structure)
11. [Relocated Assets and Their Role](#relocated-assets-and-their-role)
12. [Local Development](#local-development)
13. [Operational Notes](#operational-notes)

## System Purpose

This project is designed to bridge a difficult source format into a reliable user download experience:

1. TradingRef edition payloads are obfuscated and heterogeneous.
2. Source content may be image sequences, normal PDFs, or locked PDFs.
3. The app normalizes this variability into one predictable output: a downloadable PDF.

Core goals:

1. Fast selection UX.
2. High success rate across multiple content modes.
3. Clear progress telemetry during long-running generation.
4. Defensive request handling and rate limits for server stability.

## High-Level Architecture

```text
Browser UI (Next.js Client Components)
				|
				| HTTP calls
				v
Next.js Route Handlers (Node runtime)
	- /api/data/[date]
	- /api/newspapers
	- /api/editions
	- /api/pdf (POST + progress GET)
				|
				| fetch + decode + merge
				v
TradingRef Live API (https://data.tradingref.com/YYYYMMDD.json)
				|
				| mixed assets (images/PDFs/locked PDFs)
				v
In-memory PDF assembly + optional Python unlock helper
				|
				v
Data URL PDF returned to browser for direct download
```

## End-to-End User Flow

### 1) Date selection

UI calls `GET /api/data/[date]`.

Server responsibilities:

1. Validate date format (`YYYYMMDD`).
2. Apply rate limiting.
3. Fetch live TradingRef JSON for date.
4. Extract normalized language list.

### 2) Language selection

UI calls `GET /api/newspapers?date=...&language=...`.

Server responsibilities:

1. Validate query values.
2. Resolve normalized key back to source key (`findMatchingKey`).
3. Return newspapers for chosen language.

### 3) Newspaper selection

UI calls `GET /api/editions?date=...&language=...&newspaper=...`.

Server responsibilities:

1. Validate query values.
2. Resolve source keys.
3. Return edition list with page counts.

### 4) Download trigger

UI calls `POST /api/pdf` with `{ date, language, newspaper, edition, requestId }` and starts fast polling (`GET /api/pdf?jobId=...`).

Server responsibilities:

1. Validate payload and request size.
2. Create progress job in memory.
3. Decrypt selected edition metadata.
4. Build source URLs.
5. Route to the right generation path by type.
6. Return PDF as `data:application/pdf;base64,...` when complete.

## PDF Generation Mechanism

The pipeline supports multiple source formats with fallback behavior.

### Type handling

1. `image`: each page is downloaded and embedded as a PDF page.
2. `pdf`: source PDFs are appended page-by-page to merged output.
3. `pdfl` and `dfl`: password-aware merge path via Python helper.
4. Unknown or unsupported response: attempt image proxy conversion path.

### Locked PDF path

For locked PDFs, the Node route calls a local Python helper:

1. Script: `scripts/merge_locked_pdfs.py`
2. Input: URL list + password map (filename first 10 chars heuristic)
3. Output: merged PDF base64 payload + failure list

If decryption path fails, the system attempts a last-resort conversion via proxy image flow.

### Progress telemetry

A request-level job stores these stages:

1. `validating`
2. `fetching`
3. `downloading`
4. `decrypting`
5. `merging`
6. `complete` or `error`

The client polls this status every 300ms to render real-time logs and progress bars.

## Data Model and Decryption

TradingRef responses use a 4-level hierarchy:

```json
{
	"language": {
		"newspaper": {
			"edition": "obfuscated_payload"
		}
	}
}
```

Each edition payload is decoded by character translation against a reversed alphabet.

Decoded structure is split by delimiters:

1. `q!` separates `type`, `prefix`, `pagesBlob`.
2. `m%` separates page/file entries.

Resulting normalized object:

```json
{
	"type": "image | pdf | pdfl | dfl | ...",
	"prefix": "https://...",
	"pages": ["file1", "file2"],
	"pages_count": 2,
	"raw_decoded": "..."
}
```

## API Surface

### `GET /api/data/[date]`

Returns available languages for a date.

### `GET /api/newspapers`

Query: `date`, `language`.

Returns newspapers under a language.

### `GET /api/editions`

Query: `date`, `language`, `newspaper`.

Returns edition list and page hints.

### `POST /api/pdf`

Payload: `date`, `language`, `newspaper`, `edition`, optional `requestId`.

Returns final PDF data URL when successful.

### `GET /api/pdf?jobId=...`

Returns in-flight progress snapshot.

## Reliability and Safety Layers

### Input validation

1. Date format checks.
2. Language/newspaper/edition sanitization.
3. Request body size constraints.

### Traffic control

In-memory rate limiter presets:

1. `strict` for expensive routes.
2. `standard` for common lookups.
3. `relaxed` for high-frequency progress polling.

### Network resilience

1. Timeout-bound fetch calls.
2. Retry with exponential backoff.
3. Circuit breaker to prevent cascading failures.

### Failure behavior

If primary data assembly fails, route returns sanitized errors and preserves server-side diagnostic logs.

## Frontend Interaction Model

Primary logic is orchestrated in `use-newspaper` hook:

1. Cascading state reset on every upstream selection change.
2. Request cancellation with `AbortController` to prevent stale updates.
3. Progress polling lifecycle with auto-stop on completion/error.
4. Download trigger using generated data URL.

UI components provide:

1. Neumorphic visual language.
2. Animated state transitions.
3. Stage-aware progress panel.
4. Download-ready confirmation state.

## Language Coverage

The platform currently recognizes 14 language groups:

1. Bengali
2. Hindi
3. English
4. Gujarati
5. Marathi
6. Tamil
7. Telugu
8. Kannada
9. Malayalam
10. Punjabi
11. Odia
12. Urdu
13. Assamese
14. Konkani

## Project Structure

```text
vartta-kosha/
├─ src/
│  ├─ app/
│  │  ├─ api/
│  │  │  ├─ data/[date]/route.ts
│  │  │  ├─ newspapers/route.ts
│  │  │  ├─ editions/route.ts
│  │  │  └─ pdf/route.ts
│  │  └─ page.tsx
│  ├─ hooks/use-newspaper.ts
│  ├─ lib/
│  │  ├─ api/tradingref.ts
│  │  ├─ fetch-utils.ts
│  │  └─ rate-limit.ts
│  └─ components/
├─ scripts/
│  ├─ merge_locked_pdfs.py
│  ├─ colab/
│  └─ legacy-local/
└─ resources/tradingref-data/
	 ├─ downloads/
	 └─ json-snapshots/
```

## Relocated Assets and Their Role

The following external project assets were analyzed and reorganized into this app repository.

### 1) JSON snapshots

New location: `resources/tradingref-data/json-snapshots/`

Files:

1. `20260330.json`
2. `20260330.decrypted.json`
3. `20260330.resolved.json`

Purpose:

1. Raw source sample (`.json`).
2. Decoded intermediate (`.decrypted.json`).
3. Fully resolved URL-ready reference (`.resolved.json`).

These files document the full transformation chain from obfuscated payload to direct asset URLs.

### 2) Download workspace

New location: `resources/tradingref-data/downloads/`

Purpose:

1. Local workspace for captured/downloaded artifacts.
2. Useful for debugging payload quality and merge outcomes.

### 3) Colab automation scripts

New location: `scripts/colab/`

Files:

1. `colab_date_discovery.py`
2. `colab_mass_archiver_v4.py`

Purpose:

1. Discover earliest valid TradingRef date.
2. Perform large-scale date archiving and index generation with batch uploads.

### 4) Local visual diagnostic server

New location: `scripts/legacy-local/tradingref_visual_server.py`

Purpose:

1. Standalone local workflow tester for TradingRef payload inspection.
2. Interactive selection UI for data traversal and direct/proxy URL checks.
3. Optional local asset fetch and locked-PDF hinting.

## Local Development

### Prerequisites

1. Node.js 20+ recommended.
2. pnpm.

### Install and run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

### Build and start

```bash
pnpm build
pnpm start
```

## Operational Notes

### Cloud Run dependency for locked PDF merge

Locked PDFs are decrypted through an external Cloud Run service.

Set the following server-side environment variables:

1. `LOCKED_PDF_DECRYPT_URL`
2. `LOCKED_PDF_DECRYPT_TOKEN` (optional but recommended)

### Runtime assumptions

1. Cloud Run decrypt service is reachable from the Next.js runtime.
2. External endpoints are reachable:
	 1. `https://data.tradingref.com`
	 2. `https://images.weserv.nl`

### Security note

Current rate limiting is in-memory. For multi-instance deployments, migrate to a centralized store-backed limiter.

---

This README is intentionally implementation-centric, so maintainers can reason about behavior, failure modes, and extension points without needing to reverse engineer route logic first.
