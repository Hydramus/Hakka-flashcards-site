"""CI verification script for vocab image manifest.

Checks that:
1. Every unique English definition in the CSV has a manifest entry.
2. No orphaned manifest entries exist (definitions not in CSV).

Does NOT check image files on disk (they are hosted separately).

Usage:
    python verify_manifest.py
    python verify_manifest.py --csv path/to/vocab.csv --manifest path/to/manifest.json
"""

import argparse
import csv
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
DEFAULT_CSV = REPO_ROOT / "Hakka Dictionary" / "Hakka Vocabulary.csv"
DEFAULT_MANIFEST = REPO_ROOT / "src" / "data" / "vocab-image-manifest.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify vocab image manifest completeness"
    )
    parser.add_argument(
        "--csv", type=str, default=str(DEFAULT_CSV),
        help="Path to vocabulary CSV",
    )
    parser.add_argument(
        "--manifest", type=str, default=str(DEFAULT_MANIFEST),
        help="Path to manifest JSON",
    )
    return parser.parse_args()


def load_csv_definitions(csv_path: str) -> set[str]:
    """Extract unique English definitions from the CSV."""
    definitions = set()
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            english = row.get('English Definition', '').strip()
            if english:
                definitions.add(english)
    return definitions


def load_manifest(manifest_path: str) -> dict:
    """Load the manifest JSON."""
    with open(manifest_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def main() -> None:
    args = parse_args()
    errors = 0

    # Load data
    csv_definitions = load_csv_definitions(args.csv)
    manifest = load_manifest(args.manifest)
    manifest_definitions = set(manifest.keys())

    # Check: every CSV definition should be in the manifest
    missing = csv_definitions - manifest_definitions
    if missing:
        print(f"\n** MISSING from manifest ({len(missing)} entries):")
        for defn in sorted(missing)[:20]:
            print(f"  - {defn}")
        if len(missing) > 20:
            print(f"  ... and {len(missing) - 20} more")
        errors += len(missing)

    # Check: orphaned manifest entries (in manifest but not in CSV)
    orphaned = manifest_definitions - csv_definitions
    if orphaned:
        print(f"\n** ORPHANED in manifest ({len(orphaned)} entries):")
        for defn in sorted(orphaned)[:20]:
            print(f"  - {defn}")
        if len(orphaned) > 20:
            print(f"  ... and {len(orphaned) - 20} more")
        errors += len(orphaned)

    # Summary
    print(f"\nCSV definitions:      {len(csv_definitions)}")
    print(f"Manifest entries:     {len(manifest_definitions)}")
    print(f"Missing:              {len(missing)}")
    print(f"Orphaned:             {len(orphaned)}")

    if errors == 0:
        print("\nAll checks passed.")
        sys.exit(0)
    else:
        print(f"\n{errors} issue(s) found.")
        sys.exit(1)


if __name__ == "__main__":
    main()
