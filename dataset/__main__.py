import sys
import argparse
from pathlib import Path

# Ensure UTF-8 output on Windows terminals for Hindi/Marathi script
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from .discovery import print_discovery
from .collector import DatasetCollector

def main():
    parser = argparse.ArgumentParser(
        prog="python -m dataset",
        description="Vartta Kosha - TradingRef Newspaper Dataset Pipeline for OCR"
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: discover
    discover_parser = subparsers.add_parser("discover", help="Discover available newspapers and editions")
    discover_parser.add_argument("--date", required=True, help="Date in YYYY-MM-DD or YYYYMMDD format")
    discover_parser.add_argument("--language", help="Optional language filter (e.g., Marathi, Hindi, English)")

    # Subcommand: collect
    collect_parser = subparsers.add_parser("collect", help="Collect newspaper issues, assemble PDF and extract page images")
    collect_parser.add_argument("--start-date", help="Start date (YYYY-MM-DD or YYYYMMDD)")
    collect_parser.add_argument("--end-date", help="End date (YYYY-MM-DD or YYYYMMDD)")
    collect_parser.add_argument("--date", help="Single date (alias for start-date and end-date)")
    collect_parser.add_argument("--language", required=True, help="Language (e.g., Marathi, Hindi, English)")
    collect_parser.add_argument("--newspaper", default="all", help="Newspaper name or 'all'")
    collect_parser.add_argument("--edition", default="all", help="Edition name or 'all'")
    collect_parser.add_argument("--delay", type=float, default=1.0, help="Delay in seconds between requests (default: 1.0)")
    collect_parser.add_argument("--output-dir", default="dataset", help="Output directory path (default: dataset)")

    args = parser.parse_args()

    if args.command == "discover":
        print_discovery(args.date, args.language)

    elif args.command == "collect":
        start_date = args.start_date or args.date
        end_date = args.end_date or args.date or start_date

        if not start_date:
            print("Error: Either --start-date or --date must be specified.")
            sys.exit(1)

        collector = DatasetCollector(output_dir=Path(args.output_dir), delay=args.delay)
        records = collector.collect_range(
            start_date=start_date,
            end_date=end_date,
            language=args.language,
            newspaper=args.newspaper,
            edition=args.edition,
        )

        if records:
            # Print success summary for collected issues
            for rec in records:
                pdf_abs = (collector.output_dir / rec['pdf_path']).resolve()
                img_dir = collector.images_dir / rec['date'] / rec['language'] / collector._clean_filename(rec['newspaper']) / collector._clean_filename(rec['edition'])
                images_count = len(list(img_dir.glob("page_*.jpg"))) if img_dir.exists() else rec['pages_count']

                print("\n=======================================================")
                print("SUCCESS\n")
                print(f"Date: {rec['date']}")
                print(f"Language: {rec['language'].capitalize()}")
                print(f"Newspaper: {rec['newspaper']}")
                print(f"Edition: {rec['edition']}")
                print(f"Pages: {rec['pages_count']}")
                print(f"PDF: {pdf_abs}")
                print(f"Images: {images_count}")
                print(f"Manifest: {collector.manifest_path.resolve()}")
                print("=======================================================\n")
        else:
            print("\nNo issues were collected or all matched issues were already up to date.")

if __name__ == "__main__":
    main()
