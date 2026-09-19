# OCR Research Dataset Collection Pipeline

This package provides a CLI tool for discovering and collecting newspaper issues across multiple languages (Marathi, Hindi, English, etc.), dates, and editions directly from the TradingRef live infrastructure and cached snapshots.

## Features

- **Hierarchical Discovery**: Inspect available dates, languages, newspapers, and editions without downloading.
- **Automated Decryption**: Handles live Service Worker decryption (`sw.js`) and locked password-protected historical PDF issues (`pdfl` type with 10-character page passwords).
- **High-Resolution Page Rendering**: Converts PDF pages into 300 DPI JPEG images suitable for OCR benchmarks and machine learning training datasets.
- **Consolidated PDF Generation**: Combines downloaded pages into an issue-level PDF.
- **Metadata Indexing**: Automatically updates `manifest.csv` with per-page metadata (page number, image dimensions, file paths, SHA256 checksums).
- **Resilient & Polite**: Includes rate limiting, anti-hotlinking headers, deduplication tracking (`downloaded_issues.json`), and error logging (`failed_issues.csv`).

---

## Installation

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Ensure Node.js and Chromium/Chrome or Edge are installed (used for resolving live encrypted editions).

---

## Usage

### 1. Discover Available Editions

```bash
# Discover all languages and newspapers for a date
python -m dataset discover --date 2026-09-17

# Filter by language
python -m dataset discover --date 2026-09-17 --language Marathi

# Filter by language and newspaper
python -m dataset discover --date 2026-09-17 --language Marathi --newspaper "Loksatta"
```

### 2. Collect Issues

```bash
# Collect a specific newspaper edition
python -m dataset collect --date 2026-09-17 --language Marathi --newspaper "Loksatta" --edition "Pune"

# Collect English papers (e.g. Hindustan Times)
python -m dataset collect --date 2026-06-02 --language English --newspaper "Hindustan Times" --edition "Delhi"

# Collect all editions of a newspaper for a given date
python -m dataset collect --date 2026-09-17 --language Marathi --newspaper "Loksatta"

# Dry run mode (simulate collection without downloading files)
python -m dataset collect --date 2026-09-17 --language Marathi --newspaper "Loksatta" --dry-run
```

---

## Output Structure

```
dataset/
├── images/
│   └── <language>/
│       └── <newspaper>/
│           └── <YYYY-MM-DD>/
│               └── <edition>/
│                   ├── page_001.jpg
│                   ├── page_002.jpg
│                   └── ...
├── pdf/
│   └── <language>/
│       └── <newspaper>/
│           └── <YYYY-MM-DD>/
│               └── <edition>.pdf
├── manifest.csv
├── downloaded_issues.json
└── failed_issues.csv
```
