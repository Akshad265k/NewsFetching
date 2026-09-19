import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def get_snapshot_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "resources" / "tradingref-data" / "json-snapshots"

def fetch_date_manifest(date_str: str) -> Optional[Dict[str, Any]]:
    clean_date = date_str.replace("-", "")
    snapshot_file = get_snapshot_dir() / f"{clean_date}.json"

    # Check local snapshot first
    if snapshot_file.exists():
        try:
            with open(snapshot_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data and isinstance(data, dict):
                    return data
        except Exception:
            pass

    # Fetch live from TradingRef endpoint
    url = f"https://www.tradingref.com/api/editions/{clean_date}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.tradingref.com/",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                if data and isinstance(data, dict):
                    # Save to snapshot dir
                    try:
                        snapshot_file.parent.mkdir(parents=True, exist_ok=True)
                        with open(snapshot_file, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                    except Exception:
                        pass
                    return data
    except urllib.error.URLError as e:
        print(f"[Discovery] Error fetching {url}: {e}")

    return None

def discover_newspapers(date_str: str, language_filter: Optional[str] = None) -> Dict[str, Dict[str, list]]:
    data = fetch_date_manifest(date_str)
    if not data:
        return {}

    formatted_date = date_str.replace("-", "")
    formatted_display = f"{formatted_date[:4]}-{formatted_date[4:6]}-{formatted_date[6:8]}"

    results: Dict[str, Dict[str, list]] = {}

    for lang, papers in data.items():
        if lang.lower() == "api":
            continue
        if language_filter and lang.lower() != language_filter.lower():
            continue
        if not isinstance(papers, dict):
            continue

        results[lang] = {}
        for paper, editions in papers.items():
            if isinstance(editions, dict):
                results[lang][paper] = list(editions.keys())

    return results

def print_discovery(date_str: str, language_filter: Optional[str] = None):
    clean_date = date_str.replace("-", "")
    formatted_date = f"{clean_date[:4]}-{clean_date[4:6]}-{clean_date[6:8]}"
    results = discover_newspapers(date_str, language_filter)

    print(f"\nDate: {formatted_date}\n")
    if not results:
        print("No newspapers found for this date/language.")
        return

    for lang, papers in sorted(results.items()):
        print(f"{lang.capitalize()}:")
        for paper, editions in sorted(papers.items()):
            print(f"  {paper}")
            for edition in sorted(editions):
                print(f"    - {edition}")
        print()
