#!/usr/bin/env python3
"""Print Phase 3 exit metrics.

  python scripts/phase3_exit_check.py
  python scripts/phase3_exit_check.py --window-days 30
  python scripts/phase3_exit_check.py --json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from lib.db import create_service_client  # noqa: E402
from lib.phase3_exit import compute_phase3_exit, format_phase3_exit_report  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 3 exit check")
    parser.add_argument("--window-days", type=int, default=30)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = compute_phase3_exit(
        create_service_client(),
        window_days=args.window_days,
    )
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(format_phase3_exit_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
