"""Operator command for tenancy-document retention (dry-run by default)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")
from lib.tenancy_docs_retention import run_retention


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Purge due objects (also requires DOCS_RETENTION_PURGE_ENABLED=true)",
    )
    parser.add_argument(
        "--confirm",
        default="",
        help='Required with --commit; pass exactly "PURGE"',
    )
    args = parser.parse_args()
    if args.commit and args.confirm != "PURGE":
        parser.error('--commit requires --confirm "PURGE"')

    result = run_retention(dry_run=not args.commit)
    print(json.dumps(result, indent=2, default=str))
    return 1 if result.get("failed") else 0


if __name__ == "__main__":
    raise SystemExit(main())
