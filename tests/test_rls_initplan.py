"""RLS policies must call auth.uid() / auth.jwt() through a scalar subselect.

A bare call in a policy is re-evaluated for every row; `(select auth.uid())` runs once
per query. Migrations from 051 on are checked so the advisor finding cannot return.
"""

import re
from pathlib import Path

SQL_DIR = Path(__file__).resolve().parents[1] / "sql"
FIRST_CHECKED = 51

_POLICY_STMT = re.compile(r"(?is)\b(?:create|alter)\s+policy\b.*?;")
_BARE_AUTH = re.compile(r"(?i)(?<!select )auth\.(uid|jwt|role)\(\)")


def _numbered_sql():
    for path in sorted(SQL_DIR.glob("[0-9][0-9][0-9]_*.sql")):
        if int(path.name[:3]) >= FIRST_CHECKED:
            yield path


def _strip_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


def test_policies_from_051_wrap_auth_calls():
    offenders = []
    for path in _numbered_sql():
        sql = _strip_comments(path.read_text(encoding="utf-8"))
        for stmt in _POLICY_STMT.findall(sql):
            if _BARE_AUTH.search(stmt):
                offenders.append(f"{path.name}: {stmt.splitlines()[0]}")
    assert not offenders, "bare auth call in policy:\n" + "\n".join(offenders)


def test_051_drops_duplicate_owner_policies_and_keeps_owner_all():
    sql = _strip_comments(
        (SQL_DIR / "051_rls_initplan_and_duplicate_policies.sql").read_text(encoding="utf-8")
    )
    for table in ("properties", "units", "reminders", "transactions"):
        for cmd in ("select", "insert", "update", "delete"):
            assert f'drop policy if exists "Owners {cmd} {table}" on public.{table};' in sql
        assert f"alter policy owner_{table} on public.{table}" in sql
    assert len(re.findall(r"(?m)^alter policy ", sql)) == 68
