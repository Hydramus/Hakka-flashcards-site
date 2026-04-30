"""Convert idiom CSVs from diacritic pronunciation to tone-number form.

Mirrors hkilang/TTS' tone notation:
  1 -> acute  (U+0301)
  2 -> macron (U+0304)
  3 -> breve  (U+0306) on non-entering syllables
  4 -> grave  (U+0300) on non-entering syllables
  5 -> breve  on entering syllables (final -p/-t/-k)
  6 -> grave  on entering syllables

Defensive: U+030C (caron) is treated as breve (some sources use it interchangeably).

Idempotent: files already containing tone digits in the pronunciation column
are detected and skipped.

Backups land in `Hakka Dictionary/_backup_diacritic/` before any rewrite.
A `conversion_report.txt` next to the script summarizes counts and anomalies.
"""

from __future__ import annotations

import csv
import io
import shutil
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_DIR = REPO_ROOT / "Hakka Dictionary"
BACKUP_DIR = CSV_DIR / "_backup_diacritic"
REPORT_PATH = Path(__file__).resolve().parent / "conversion_report.txt"

PRONUNCIATION_HEADER = "Hakka Pronunciation"

DIACRITIC_TO_TONE = {
    "́": 1,  # acute
    "̄": 2,  # macron
    "̆": 3,  # breve
    "̌": 3,  # caron (defensive — treat same as breve)
    "̀": 4,  # grave
}

ENTERING_FINALS = {"p", "t", "k"}


def is_combining(ch: str) -> bool:
    return unicodedata.combining(ch) != 0


def convert_pronunciation(pron: str, anomalies: list[str]) -> str:
    """Walk the string; replace each alphabetic syllable with base+digit.

    Non-alphabetic characters (spaces, dashes, punctuation, dollar sign, etc.)
    pass through unchanged.

    Records anomalies (no-diacritic syllables, acute/macron on stop-final
    syllables) into the provided list — caller decides whether to log them.
    """
    nfd = unicodedata.normalize("NFD", pron)
    out: list[str] = []
    i = 0
    n = len(nfd)
    while i < n:
        ch = nfd[i]
        if ch.isalpha() and not is_combining(ch):
            j = i
            while j < n and (nfd[j].isalpha() or is_combining(nfd[j])):
                j += 1
            syllable = nfd[i:j]
            base = "".join(c for c in syllable if not is_combining(c))
            tone: int | None = None
            for c in syllable:
                if c in DIACRITIC_TO_TONE:
                    tone = DIACRITIC_TO_TONE[c]
                    break
            if tone is None:
                anomalies.append(f"unmarked syllable: {base!r}")
                out.append(base)
            else:
                last = base[-1].lower() if base else ""
                if last in ENTERING_FINALS:
                    if tone in (3, 4):
                        tone += 2
                    elif tone in (1, 2):
                        anomalies.append(
                            f"unexpected tone {tone} on stop-final syllable: {base!r}"
                        )
                out.append(base + str(tone))
            i = j
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def already_numeric(pron: str) -> bool:
    return any(c.isdigit() for c in pron)


def detect_pronunciation_column(header: list[str]) -> int:
    for idx, name in enumerate(header):
        if name.strip() == PRONUNCIATION_HEADER:
            return idx
    raise ValueError(f"no '{PRONUNCIATION_HEADER}' column in header: {header}")


def read_csv_text(path: Path) -> tuple[str, str, list[list[str]]]:
    """Returns (encoding_label, line_terminator, rows)."""
    raw = path.read_bytes()
    encoding = "utf-8-sig" if raw.startswith(b"\xef\xbb\xbf") else "utf-8"
    text = raw.decode(encoding)
    line_term = "\r\n" if "\r\n" in text else "\n"
    reader = csv.reader(io.StringIO(text))
    rows = [list(r) for r in reader]
    return encoding, line_term, rows


def write_csv_text(path: Path, encoding: str, line_term: str, rows: list[list[str]]) -> None:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator=line_term, quoting=csv.QUOTE_MINIMAL)
    for row in rows:
        writer.writerow(row)
    data = buf.getvalue().encode(encoding)
    path.write_bytes(data)


def process_file(path: Path, report_lines: list[str]) -> bool:
    encoding, line_term, rows = read_csv_text(path)
    if not rows:
        report_lines.append(f"{path.name}: empty, skipped")
        return False
    header = rows[0]
    try:
        pron_idx = detect_pronunciation_column(header)
    except ValueError as e:
        report_lines.append(f"{path.name}: {e}")
        return False

    sample_pron = next((r[pron_idx] for r in rows[1:] if pron_idx < len(r) and r[pron_idx]), "")
    if sample_pron and already_numeric(sample_pron):
        report_lines.append(f"{path.name}: already numeric (sample {sample_pron!r}), skipped")
        return False

    anomalies: list[str] = []
    tone_counts: Counter[str] = Counter()
    converted_rows = [header]
    for row in rows[1:]:
        if pron_idx >= len(row) or not row[pron_idx]:
            converted_rows.append(row)
            continue
        new_pron = convert_pronunciation(row[pron_idx], anomalies)
        for ch in new_pron:
            if ch.isdigit():
                tone_counts[ch] += 1
        new_row = list(row)
        new_row[pron_idx] = new_pron
        converted_rows.append(new_row)

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = BACKUP_DIR / path.name
    shutil.copy2(path, backup_path)

    write_csv_text(path, encoding, line_term, converted_rows)

    report_lines.append(f"\n=== {path.name} ===")
    report_lines.append(f"backup: {backup_path.relative_to(REPO_ROOT)}")
    report_lines.append(f"rows converted: {len(converted_rows) - 1}")
    report_lines.append("tone counts: " + ", ".join(
        f"{t}={tone_counts.get(t, 0)}" for t in "123456"
    ))
    if anomalies:
        capped = anomalies[:50]
        report_lines.append(f"anomalies ({len(anomalies)} total, showing up to 50):")
        for a in capped:
            report_lines.append(f"  - {a}")
    else:
        report_lines.append("anomalies: none")
    return True


def main() -> int:
    if not CSV_DIR.is_dir():
        print(f"CSV directory not found: {CSV_DIR}", file=sys.stderr)
        return 1
    csv_files = sorted(p for p in CSV_DIR.glob("*.csv"))
    if not csv_files:
        print(f"No CSVs in {CSV_DIR}", file=sys.stderr)
        return 1

    report_lines = [
        "Hakka idiom pronunciation conversion report",
        f"generated: {datetime.now(timezone.utc).isoformat()}",
    ]
    converted_count = 0
    for path in csv_files:
        if path.name.startswith("_") or path.name == "manifest.json":
            continue
        if process_file(path, report_lines):
            converted_count += 1

    report_lines.append("")
    report_lines.append(f"files converted: {converted_count}")
    REPORT_PATH.write_text("\n".join(report_lines), encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for line in report_lines:
        print(line)
    print(f"\nReport written to {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
