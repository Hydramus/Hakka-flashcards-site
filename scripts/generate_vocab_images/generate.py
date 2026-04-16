"""Main orchestrator for vocab image generation.

Reads the Hakka Vocabulary CSV, generates images for each unique
English definition using ComfyUI + FLUX.1-schnell, and maintains
an image manifest for the web app.

Usage:
    python generate.py                     # Generate missing images
    python generate.py --dry-run           # Preview what would be generated
    python generate.py --force             # Regenerate all images
    python generate.py --comfyui-url URL   # Custom ComfyUI server address
"""

import argparse
import csv
import logging
import os
import sys
import time
from pathlib import Path

# Ensure scripts directory is on sys.path for relative imports
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

from slugify_util import slugify
from prompts import build_prompt, load_overrides
from manifest import Manifest
from providers.comfyui import ComfyUIProvider

# Paths relative to repo root
CSV_PATH = REPO_ROOT / "Hakka Vocabulary.csv"
IMAGES_DIR = REPO_ROOT / "public" / "vocab-images"
MANIFEST_PATH = REPO_ROOT / "src" / "data" / "vocab-image-manifest.json"
OVERRIDES_PATH = SCRIPT_DIR / "overrides.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate vocab images using ComfyUI + FLUX.1-schnell"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate all images, even if they already exist",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be generated without actually generating",
    )
    parser.add_argument('--limit', type=int, default=None,
                   help='Generate only N random images for testing (default: generate all)'
    )
    parser.add_argument(
        "--comfyui-url",
        default="http://127.0.0.1:8188",
        help="ComfyUI server URL (default: http://127.0.0.1:8188)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Save manifest checkpoint every N images (default: 10)",
    )
    parser.add_argument(
        "--csv",
        type=str,
        default=str(CSV_PATH),
        help=f"Path to vocabulary CSV (default: {CSV_PATH})",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Base seed for image generation (default: 42)",
    )
    parser.add_argument(
        "--lowram",
        action="store_true",
        help="Throttle generation by sleeping between images to reduce system load",
    )
    parser.add_argument(
        "--lowram-delay",
        type=float,
        default=3.0,
        metavar="N",
        help="Seconds to sleep between generations when --lowram is active (default: 3.0)",
    )
    return parser.parse_args()


def load_vocab(csv_path: str) -> list[dict]:
    """Load vocabulary entries from the CSV file.

    Returns:
        List of dicts with keys: mandarin, hakka_chars, pronunciation, english
    """
    entries = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            english = row.get('English Definition', '').strip()
            if not english:
                continue
            entries.append({
                'mandarin': row.get('普通中文', '').strip(),
                'hakka_chars': row.get('客家汉字', '').strip(),
                'pronunciation': row.get('Hakka Pronunciation', '').strip(),
                'english': english,
            })
    return entries


def deduplicate(entries: list[dict]) -> list[dict]:
    """Remove duplicate English definitions, keeping the first occurrence."""
    seen = set()
    unique = []
    for entry in entries:
        english = entry['english']
        if english not in seen:
            seen.add(english)
            unique.append(entry)
    return unique


def main() -> None:
    args = parse_args()

    # Load vocabulary
    logger.info("Loading vocabulary from %s", args.csv)
    all_entries = load_vocab(args.csv)
    logger.info("Loaded %d entries from CSV", len(all_entries))

    # Deduplicate
    entries = deduplicate(all_entries)
    duplicates_skipped = len(all_entries) - len(entries)
    if duplicates_skipped:
        logger.info("Skipped %d duplicate English definitions", duplicates_skipped)
    logger.info("Processing %d unique English definitions", len(entries))

    # Apply random limit if specified
    if args.limit and args.limit > 0:
        import random
        original_count = len(entries)
        entries = random.sample(entries, min(args.limit, len(entries)))
        logger.info("Randomly selected %d/%d entries for testing", len(entries), original_count)

    # Load overrides and manifest
    overrides = load_overrides(str(OVERRIDES_PATH))
    if overrides:
        logger.info("Loaded %d prompt overrides", len(overrides))

    manifest = Manifest(MANIFEST_PATH)
    logger.info("Existing manifest has %d entries", len(manifest))

    # Ensure image output directory exists
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Initialize provider (not needed for dry-run)
    provider = None
    if not args.dry_run:
        provider = ComfyUIProvider(args.comfyui_url)

    if args.lowram:
        logger.info(
            "Low-RAM mode enabled: sleeping %.1fs between generations",
            args.lowram_delay,
        )

    # Counters
    generated = 0
    skipped_exists = 0
    failed = 0
    total = len(entries)

    start_time = time.time()

    for i, entry in enumerate(entries, 1):
        english = entry['english']
        slug = slugify(english)
        image_path = f"vocab-images/{slug}.png"
        target_file = IMAGES_DIR / f"{slug}.png"

        # Skip if image already exists (unless --force)
        if target_file.exists() and not args.force:
            skipped_exists += 1
            # Ensure manifest entry exists even for pre-existing images
            if not manifest.has(english):
                manifest.add(english, slug, image_path)
            continue

        prompt = build_prompt(english, overrides)

        if args.dry_run:
            logger.info(
                "[%d/%d] WOULD GENERATE: %s -> %s",
                i, total, english, target_file,
            )
            logger.info("  Prompt: %s", prompt[:120])
            # Still add to manifest in dry-run so we can preview
            manifest.add(english, slug, image_path)
            generated += 1
            continue

        # Generate image
        logger.info("[%d/%d] Generating: %s -> %s", i, total, english, slug)
        seed = args.seed + i  # Vary seed per image for diversity
        success = provider.generate_image(prompt, str(target_file), seed=seed) # type: ignore

        if success:
            generated += 1
            manifest.add(english, slug, image_path)
            logger.info("  OK (%d/%d done)", generated, total - skipped_exists)
            if args.lowram:
                time.sleep(args.lowram_delay)
        else:
            failed += 1
            logger.error("  FAILED: %s", english)

        # Checkpoint manifest periodically
        if generated > 0 and generated % args.batch_size == 0:
            manifest.save()
            logger.info("  Manifest checkpoint saved (%d entries)", len(manifest))

    # Final manifest save
    manifest.save()

    elapsed = time.time() - start_time
    logger.info("=" * 60)
    logger.info("COMPLETE in %.1fs", elapsed)
    logger.info("  Generated:  %d", generated)
    logger.info("  Skipped:    %d (already exist)", skipped_exists)
    logger.info("  Duplicates: %d (first-wins dedup)", duplicates_skipped)
    logger.info("  Failed:     %d", failed)
    logger.info("  Manifest:   %d total entries", len(manifest))
    logger.info("=" * 60)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
