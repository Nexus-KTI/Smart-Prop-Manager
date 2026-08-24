"""Print Phase 2 exit-criteria metrics (re-run weekly / on demand).

Usage (from repo root, with .env loaded):
  python scripts/phase2_exit_check.py
  python scripts/phase2_exit_check.py --window-days 30
  python scripts/phase2_exit_check.py --json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env", override=True)

from lib.db import create_service_client  # noqa: E402
from lib.phase2_exit import compute_phase2_exit, format_phase2_exit_report  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 2 exit criteria check")
    parser.add_argument(
        "--window-days",
        type=int,
        default=30,
        help="Trailing window for non-rent collection and banner views (default 30)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw JSON instead of the text report",
    )
    args = parser.parse_args()

    report = compute_phase2_exit(
        create_service_client(),
        window_days=args.window_days,
    )
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(format_phase2_exit_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
