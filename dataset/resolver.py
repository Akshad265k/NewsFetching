import json
import subprocess
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def join_page_url(prefix: str, page: str) -> str:
    if not page:
        return prefix
    if page.startswith("http://") or page.startswith("https://"):
        return page
    return f"{prefix.rstrip('/')}/{page.lstrip('/')}"

def resolve_edition(date_str: str, language: str, newspaper: str, edition: str) -> Optional[Dict[str, Any]]:
    clean_date = date_str.replace("-", "")

    # 1. Try local running API first (fastest if server is active)
    query = urllib.parse.urlencode({
        "date": clean_date,
        "language": language,
        "newspaper": newspaper,
        "edition": edition,
    })
    api_url = f"http://localhost:3000/api/reader?{query}"
    try:
        req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("success") and data.get("pages"):
                    return {
                        "success": True,
                        "type": data.get("type", "image"),
                        "prefix": data.get("prefix", ""),
                        "pages": data.get("pages", []),
                        "totalPages": data.get("totalPages", len(data.get("pages", []))),
                        "newspaper": data.get("newspaper", newspaper),
                        "edition": data.get("edition", edition),
                        "language": language,
                        "source": "api",
                    }
    except Exception:
        pass

    # 2. Fallback to standalone node script
    script_path = PROJECT_ROOT / "scripts" / "resolve-edition.js"
    if script_path.exists():
        cmd = ["node", str(script_path), clean_date, language, newspaper, edition]
        try:
            result = subprocess.run(cmd, cwd=str(PROJECT_ROOT), capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                data = json.loads(result.stdout.strip())
                if data.get("success") and data.get("pages"):
                    prefix = data.get("prefix", "")
                    raw_pages = data.get("pages", [])
                    full_urls = [join_page_url(prefix, p) for p in raw_pages]
                    return {
                        "success": True,
                        "type": data.get("type", "image"),
                        "prefix": prefix,
                        "pages": full_urls,
                        "totalPages": len(full_urls),
                        "newspaper": data.get("newspaper", newspaper),
                        "edition": data.get("edition", edition),
                        "language": language,
                        "source": data.get("source", "cli_scraper"),
                    }
            else:
                print(f"[Resolver Error] {result.stderr.strip()}")
        except Exception as e:
            print(f"[Resolver Exception] {e}")

    return None
