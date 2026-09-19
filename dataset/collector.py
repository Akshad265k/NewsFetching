import os
import csv
import json
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional

import pymupdf
from PIL import Image

from .discovery import discover_newspapers
from .resolver import resolve_edition

PROJECT_ROOT = Path(__file__).resolve().parent.parent

class DatasetCollector:
    def __init__(self, output_dir: Optional[Path] = None, delay: float = 1.0, json_progress: bool = False):
        self.output_dir = Path(output_dir) if output_dir else PROJECT_ROOT / "dataset"
        self.images_dir = self.output_dir / "images"
        self.pdf_dir = self.output_dir / "pdf"
        self.manifest_path = self.output_dir / "manifest.csv"
        self.downloaded_issues_path = self.output_dir / "downloaded_issues.json"
        self.failed_issues_path = self.output_dir / "failed_issues.csv"
        self.delay = delay
        self.json_progress = json_progress

        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)

        self.downloaded_issues = self._load_downloaded_issues()
        self._init_manifest()
        self._init_failed_issues()

    def _emit_progress(self, stage: str, message: str, current: int = 0, total: int = 0, **kwargs):
        if self.json_progress:
            payload = {
                "type": "progress",
                "stage": stage,
                "message": message,
                "current": current,
                "total": total,
                "timestamp": datetime.now().isoformat(),
                **kwargs
            }
            print(f"JSON_PROGRESS:{json.dumps(payload, ensure_ascii=False)}", flush=True)

    def _load_downloaded_issues(self) -> Dict[str, Any]:
        if self.downloaded_issues_path.exists():
            try:
                with open(self.downloaded_issues_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_downloaded_issues(self):
        try:
            with open(self.downloaded_issues_path, "w", encoding="utf-8") as f:
                json.dump(self.downloaded_issues, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Warning: could not save downloaded_issues.json: {e}")

    def _init_manifest(self):
        if not self.manifest_path.exists():
            with open(self.manifest_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "id",
                    "date",
                    "language",
                    "newspaper",
                    "edition",
                    "page_number",
                    "image_path",
                    "pdf_path",
                    "source",
                    "source_url"
                ])

    def _init_failed_issues(self):
        if not self.failed_issues_path.exists():
            with open(self.failed_issues_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["date", "language", "newspaper", "edition", "reason", "timestamp"])

    def _get_next_manifest_id(self) -> int:
        count = 0
        if self.manifest_path.exists():
            with open(self.manifest_path, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                next(reader, None)  # skip header
                for _ in reader:
                    count += 1
        return count + 1

    def _record_failure(self, date: str, language: str, newspaper: str, edition: str, reason: str):
        with open(self.failed_issues_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([date, language, newspaper, edition, reason, datetime.now().isoformat()])

    def is_issue_downloaded(self, date: str, language: str, newspaper: str, edition: str) -> bool:
        key = f"{date}_{language.lower()}_{newspaper.lower()}_{edition.lower()}"
        if key in self.downloaded_issues:
            entry = self.downloaded_issues[key]
            pdf_file = self.output_dir / entry.get("pdf_path", "")
            if pdf_file.exists() and pdf_file.stat().st_size > 0:
                page_count = entry.get("pages_count", 0)
                image_dir = self.images_dir / date / language / self._clean_filename(newspaper) / self._clean_filename(edition)
                if image_dir.exists():
                    images = list(image_dir.glob("page_*.jpg"))
                    if len(images) >= page_count and page_count > 0:
                        return True
        return False

    @staticmethod
    def _clean_filename(name: str) -> str:
        return "".join(c if c.isalnum() or c in "._- " else "_" for c in name).strip()

    def download_asset(self, url: str) -> Optional[bytes]:
        parsed = urllib.parse.urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Referer": origin,
        }

        # 1. Direct download
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=30) as resp:
                    if resp.status == 200:
                        return resp.read()
            except Exception:
                time.sleep(0.5 * (attempt + 1))

        # 2. Proxy fallback via wsrv.nl (for images)
        if not url.lower().endswith(".pdf"):
            try:
                proxy_url = f"https://wsrv.nl/?url={urllib.parse.quote(url)}&output=jpg&q=95"
                req = urllib.request.Request(proxy_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    if resp.status == 200:
                        return resp.read()
            except Exception:
                pass

        return None

    def collect_issue(
        self,
        date_str: str,
        language: str,
        newspaper: str,
        edition: str
    ) -> Optional[Dict[str, Any]]:
        clean_date = date_str.replace("-", "")
        formatted_date = f"{clean_date[:4]}-{clean_date[4:6]}-{clean_date[6:8]}"
        issue_key = f"{formatted_date}_{language.lower()}_{newspaper.lower()}_{edition.lower()}"

        # 1. Deduplication check
        if self.is_issue_downloaded(formatted_date, language, newspaper, edition):
            msg = f"Issue already downloaded: {formatted_date} | {language} | {newspaper} | {edition}"
            print(f"⏩ [Skip] {msg}")
            self._emit_progress("complete", msg, current=1, total=1, issue=issue_key)
            return self.downloaded_issues[issue_key]

        print(f"📥 [Collect] Resolving issue: {formatted_date} | {language} | {newspaper} | {edition}...")
        self._emit_progress("resolving", f"Resolving issue manifest: {newspaper} ({edition})", current=0, total=1)

        resolved = resolve_edition(formatted_date, language, newspaper, edition)
        if not resolved or not resolved.get("pages"):
            reason = "Could not resolve edition pages from TradingRef"
            print(f"❌ {reason}")
            self._record_failure(formatted_date, language, newspaper, edition, reason)
            self._emit_progress("error", reason, error=reason)
            return None

        content_type = resolved.get("type", "image")
        page_urls = resolved.get("pages", [])
        total_pages = len(page_urls)

        print(f"   Found {total_pages} page(s) (type: {content_type})")
        self._emit_progress("downloading", f"Found {total_pages} pages ({content_type}). Starting extraction...", current=0, total=total_pages)

        issue_img_dir = self.images_dir / formatted_date / language / self._clean_filename(newspaper) / self._clean_filename(edition)
        issue_img_dir.mkdir(parents=True, exist_ok=True)

        pdf_filename = f"{self._clean_filename(language)}_{self._clean_filename(newspaper)}_{self._clean_filename(edition)}_{formatted_date}.pdf"
        target_pdf_path = self.pdf_dir / pdf_filename

        merged_pdf = pymupdf.open()
        saved_images: List[Path] = []

        try:
            for idx, url in enumerate(page_urls, start=1):
                img_filename = f"page_{idx:03d}.jpg"
                img_path = issue_img_dir / img_filename

                # Fast per-page resume if image already rendered on disk
                if img_path.exists() and img_path.stat().st_size > 0:
                    try:
                        img_doc = pymupdf.open(str(img_path))
                        pdf_bytes = img_doc.convert_to_pdf()
                        temp_doc = pymupdf.open("pdf", pdf_bytes)
                        merged_pdf.insert_pdf(temp_doc)
                        saved_images.append(img_path)
                        print(f"   ✓ Page {idx}/{total_pages} resumed from disk")
                        self._emit_progress("rendering", f"Page {idx}/{total_pages} loaded from cache", current=idx, total=total_pages)
                        continue
                    except Exception:
                        pass

                # Polite delay between page requests
                time.sleep(0.5)

                self._emit_progress("downloading", f"Downloading page {idx}/{total_pages}...", current=idx, total=total_pages)
                data = self.download_asset(url)
                if not data:
                    raise RuntimeError(f"Failed to download asset for page {idx}: {url}")

                # Check if downloaded data is PDF
                is_pdf = data.startswith(b"%PDF") or content_type in ["pdf", "pdfl", "pdfc"]
                if is_pdf:
                    try:
                        page_doc = pymupdf.open(stream=data, filetype="pdf")
                        # Handle locked/encrypted PDF pages (pdfl type)
                        if page_doc.is_encrypted:
                            filename = url.split("?")[0].split("/")[-1]
                            password = filename[:10]
                            page_doc.authenticate(password)
                            self._emit_progress("decrypting", f"Page {idx}/{total_pages} decrypted (pdfl)", current=idx, total=total_pages)

                        if len(page_doc) > 0:
                            # Render page to 300 DPI JPEG
                            page_pixmap = page_doc[0].get_pixmap(dpi=300)
                            page_pixmap.save(str(img_path))
                            saved_images.append(img_path)

                            # Insert into merged PDF
                            merged_pdf.insert_pdf(page_doc)
                            print(f"   ✓ Page {idx}/{total_pages} extracted from PDF and rendered (300 DPI)")
                            self._emit_progress("rendering", f"Page {idx}/{total_pages} rendered (300 DPI)", current=idx, total=total_pages)
                            continue
                    except Exception as pe:
                        print(f"   ⚠️ Could not parse as PDF directly, trying image fallback: {pe}")

                # Otherwise treat as image (PNG / JPG / WEBP)
                try:
                    img_doc = pymupdf.open(stream=data, filetype="image")
                    pdf_bytes = img_doc.convert_to_pdf()
                    temp_page_doc = pymupdf.open("pdf", pdf_bytes)
                    merged_pdf.insert_pdf(temp_page_doc)

                    # Save as standard high quality JPEG
                    from io import BytesIO
                    pil_img = Image.open(BytesIO(data))
                    if pil_img.mode in ("RGBA", "P"):
                        pil_img = pil_img.convert("RGB")
                    pil_img.save(str(img_path), "JPEG", quality=95)
                    saved_images.append(img_path)
                    print(f"   ✓ Page {idx}/{total_pages} saved as JPEG (quality=95)")
                    self._emit_progress("rendering", f"Page {idx}/{total_pages} saved as image", current=idx, total=total_pages)
                except Exception as ie:
                    raise RuntimeError(f"Failed to process page {idx} as image/PDF: {ie}")

            # Save assembled / original PDF
            self._emit_progress("merging", f"Assembling final PDF for {newspaper}...", current=total_pages, total=total_pages)
            merged_pdf.save(str(target_pdf_path))
            merged_pdf.close()

            # Validate output
            if not target_pdf_path.exists() or target_pdf_path.stat().st_size == 0:
                raise RuntimeError("Resulting PDF file is empty or missing")
            if len(saved_images) != total_pages:
                raise RuntimeError(f"Image count mismatch: expected {total_pages}, got {len(saved_images)}")

            # Append to manifest.csv
            rel_pdf_path = f"pdf/{pdf_filename}"
            start_id = self._get_next_manifest_id()
            with open(self.manifest_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                for idx, (img_p, url) in enumerate(zip(saved_images, page_urls), start=1):
                    row_id = f"{start_id + idx - 1:06d}"
                    rel_img_path = f"images/{formatted_date}/{language}/{self._clean_filename(newspaper)}/{self._clean_filename(edition)}/page_{idx:03d}.jpg"
                    writer.writerow([
                        row_id,
                        formatted_date,
                        language,
                        newspaper,
                        edition,
                        idx,
                        rel_img_path,
                        rel_pdf_path,
                        "TradingRef",
                        url
                    ])

            # Record in downloaded_issues.json
            record = {
                "date": formatted_date,
                "language": language,
                "newspaper": newspaper,
                "edition": edition,
                "pages_count": total_pages,
                "pdf_path": rel_pdf_path,
                "type": content_type,
                "downloaded_at": datetime.now().isoformat()
            }
            self.downloaded_issues[issue_key] = record
            self._save_downloaded_issues()

            self._emit_progress("complete", f"Issue collected: {newspaper} ({edition}) - {total_pages} pages", current=total_pages, total=total_pages, record=record)
            return record

        except Exception as e:
            print(f"❌ Error collecting {newspaper} ({edition}): {e}")
            self._record_failure(formatted_date, language, newspaper, edition, str(e))
            self._emit_progress("error", f"Error collecting {newspaper}: {e}", error=str(e))
            if target_pdf_path.exists() and target_pdf_path.stat().st_size == 0:
                target_pdf_path.unlink()
            return None

    def collect_range(
        self,
        start_date: str,
        end_date: str,
        language: str,
        newspaper: str = "all",
        edition: str = "all"
    ) -> List[Dict[str, Any]]:
        d1 = datetime.strptime(start_date.replace("-", ""), "%Y%m%d")
        d2 = datetime.strptime(end_date.replace("-", ""), "%Y%m%d")

        current_date = d1
        collected_records = []

        while current_date <= d2:
            date_str = current_date.strftime("%Y-%m-%d")
            print(f"\n=======================================================")
            print(f"📅 Date: {date_str}")
            print(f"=======================================================")

            discovered = discover_newspapers(date_str, language)
            lang_key = None
            for l in discovered.keys():
                if l.lower() == language.lower():
                    lang_key = l
                    break

            if not lang_key:
                print(f"No editions found for language {language} on {date_str}")
                current_date += timedelta(days=1)
                continue

            available_papers = discovered[lang_key]

            # Determine papers to collect
            papers_to_collect = {}
            if newspaper.lower() == "all":
                papers_to_collect = available_papers
            else:
                match = None
                for p in available_papers:
                    if p.lower() == newspaper.lower() or newspaper.lower() in p.lower():
                        match = p
                        break
                if match:
                    papers_to_collect[match] = available_papers[match]
                else:
                    print(f"Newspaper '{newspaper}' not found for {date_str}")

            for paper_name, editions in papers_to_collect.items():
                editions_to_collect = []
                if edition.lower() == "all":
                    editions_to_collect = editions
                else:
                    match_ed = None
                    for ed in editions:
                        if ed.lower() == edition.lower() or edition.lower() in ed.lower():
                            match_ed = ed
                            break
                    if match_ed:
                        editions_to_collect = [match_ed]
                    else:
                        print(f"Edition '{edition}' not found for {paper_name}")

                for ed_name in editions_to_collect:
                    rec = self.collect_issue(date_str, lang_key, paper_name, ed_name)
                    if rec:
                        collected_records.append(rec)
                    if self.delay > 0:
                        time.sleep(self.delay)

            current_date += timedelta(days=1)

        return collected_records


def decrypt_and_merge_locked(
    urls: List[str],
    passwords: Optional[Dict[str, str]] = None,
    output_path: Optional[str] = None
) -> bytes:
    """
    Downloads, decrypts, and merges password-protected PDF pages (pdfl) in memory.
    """
    if passwords is None:
        passwords = {}

    merged_pdf = pymupdf.open()
    collector = DatasetCollector()

    for idx, url in enumerate(urls, start=1):
        data = collector.download_asset(url)
        if not data:
            raise RuntimeError(f"Failed to download PDF asset for page {idx}: {url}")

        page_doc = pymupdf.open(stream=data, filetype="pdf")
        if page_doc.is_encrypted:
            filename = url.split("?")[0].split("/")[-1]
            pwd = passwords.get(filename) or filename[:10]
            authenticated = page_doc.authenticate(pwd)
            if not authenticated:
                raise RuntimeError(f"Password authentication failed for page {idx} ({filename})")

        merged_pdf.insert_pdf(page_doc)
        page_doc.close()

    if output_path:
        merged_pdf.save(output_path)

    pdf_bytes = merged_pdf.tobytes()
    merged_pdf.close()
    return pdf_bytes
