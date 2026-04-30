"""Generate Hakka Dictionary/manifest.json from the CSV files in that directory.

Display-name resolution priority:
  1. manifest.overrides.json (if present) — { "<filename>.csv": "Display Name" }
  2. BUILTIN_DISPLAY_NAMES below
  3. Prettify fallback (strip 'flashcards-', collapse separators)

Schema is inferred from the CSV header:
  - "main"  if header contains 普通中文
  - "idiom" if header contains 'Chinese definition'

Run this after adding/removing/renaming CSVs:

    .venv/Scripts/python.exe scripts/build_manifest.py
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_DIR = REPO_ROOT / "Hakka Dictionary"
MANIFEST_PATH = CSV_DIR / "manifest.json"
OVERRIDES_PATH = CSV_DIR / "manifest.overrides.json"

BUILTIN_DISPLAY_NAMES: dict[str, tuple[str, str]] = {
    "Hakka Vocabulary.csv":           ("core",     "Core Vocabulary"),
    "flashcards-兩字熟語.csv":         ("idiom-2",  "2 Character Idioms (兩字熟語)"),
    "flashcards-三字熟語.csv":         ("idiom-3",  "3 Character Idioms (三字熟語)"),
    "flashcards-四字熟語.csv":         ("idiom-4",  "4 Character Idioms (四字熟語)"),
    "flashcards-五字以上.csv":         ("idiom-5",  "5+ Character Phrases (五字以上)"),
    "flashcards-歇後語謎語.csv":       ("riddles",  "Slang & Riddles (歇後語謎語)"),
}

DEFAULT_FILE = "Hakka Vocabulary.csv"


def slugify(name: str) -> str:
    s = re.sub(r"\.csv$", "", name, flags=re.IGNORECASE)
    s = re.sub(r"^flashcards-", "", s)
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s or "set"


def prettify(name: str) -> str:
    s = re.sub(r"\.csv$", "", name, flags=re.IGNORECASE)
    s = re.sub(r"^flashcards-", "", s)
    s = re.sub(r"[_-]+", " ", s).strip()
    return s


def detect_schema(path: Path) -> str:
    raw = path.read_bytes()
    encoding = "utf-8-sig" if raw.startswith(b"\xef\xbb\xbf") else "utf-8"
    text = raw.decode(encoding, errors="replace")
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        return "unknown"
    cols = {c.strip() for c in header}
    if "普通中文" in cols:
        return "main"
    if "Chinese definition" in cols or "Chinese Definition" in cols:
        return "idiom"
    return "unknown"


def load_overrides() -> dict[str, str]:
    if not OVERRIDES_PATH.is_file():
        return {}
    try:
        raw = OVERRIDES_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {}
        return {str(k): str(v) for k, v in data.items()}
    except (OSError, json.JSONDecodeError) as e:
        print(f"warning: ignoring malformed overrides: {e}", file=sys.stderr)
        return {}


def build_set_entry(path: Path, overrides: dict[str, str]) -> dict:
    name = path.name
    builtin_id, builtin_display = BUILTIN_DISPLAY_NAMES.get(name, (None, None))
    display = overrides.get(name) or builtin_display or prettify(name)
    set_id = builtin_id or slugify(name)
    schema = detect_schema(path)
    entry = {
        "id": set_id,
        "displayName": display,
        "file": name,
        "schema": schema,
    }
    if name == DEFAULT_FILE:
        entry["isDefault"] = True
    return entry


def main() -> int:
    if not CSV_DIR.is_dir():
        print(f"CSV directory not found: {CSV_DIR}", file=sys.stderr)
        return 1
    overrides = load_overrides()
    csv_files = sorted(p for p in CSV_DIR.glob("*.csv"))
    if not csv_files:
        print(f"No CSVs in {CSV_DIR}", file=sys.stderr)
        return 1

    sets = [build_set_entry(p, overrides) for p in csv_files]
    sets.sort(key=lambda s: (0 if s.get("isDefault") else 1, s["displayName"]))
    seen: set[str] = set()
    for s in sets:
        if s["id"] in seen:
            print(f"warning: duplicate id {s['id']!r} for {s['file']}", file=sys.stderr)
        seen.add(s["id"])

    manifest = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sets": sets,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(f"Wrote {MANIFEST_PATH}")
    for s in sets:
        default_flag = " (default)" if s.get("isDefault") else ""
        print(f"  - [{s['id']}] {s['displayName']} <- {s['file']} ({s['schema']}){default_flag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
