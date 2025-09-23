#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import base64
import csv
import io
import logging
import os
import re
import sys
from pathlib import Path
from typing import Optional

import requests
from PIL import Image, PngImagePlugin


# -----------------------------
# Defaults you can tweak
# -----------------------------
DEFAULT_API_URL = "http://127.0.0.1:7860" # Automatic1111's Stable Diffusion WebUI API
DEFAULT_OUTDIR = "docs/assets/images"  # Output directory for generated images
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1024
DEFAULT_STEPS = 24
DEFAULT_CFG = 7.5
DEFAULT_SAMPLER = "Euler a" # Often better for simple illustrations

# Style: flat, bright, simple, kid-friendly # English prompt inserted here, can be changed for the Chinese/Hakka words.
PROMPT_TEMPLATE = (
    "simple vector illustration of a single {english}, "
    "clean minimalist style, solid color background, "
    "centered subject, no text, no background elements, "
    "flat design, bold colors, clear outline, "
    "one object only, isolated subject, white background"
)

NEGATIVE = (
    "multiple objects, many items, crowded, busy background, "
    "realistic photo, text, letters, numbers, watermark, logo, "
    "pattern, wallpaper, decorative elements, extra objects, "
    "cluttered, complex scene, multiple subjects, collage, "
    "photorealistic, 3d render, dark background, gradient background"
)

# Web export: WebP sizes (primary) + PNG fallback
WEBP_SIZES = [1024, 512]   # desktop + mobile
WEBP_QUALITY = 82          # good balance for art

# CSV header names (as you gave them)
HDR_ZH = "普通中文"
HDR_HAKKA_HANZI = "客家汉字"
HDR_HAKKA_PRON = "Hakka Pronunciation"
HDR_ENG = "English Definition"


# -----------------------------
# Helpers
# -----------------------------
def safe_filename(name: str) -> str:
    """
    Keep Chinese and common characters; remove filesystem baddies.
    macOS supports Unicode filenames; we only strip / and control chars.
    """
    name = name.strip()
    name = name.replace("/", "／").replace("\\", "⧵")
    name = re.sub(r"[\x00-\x1f]", "", name)
    return name

def ensure_api_alive(api_url: str):
    try:
        r = requests.get(f"{api_url}/sdapi/v1/sd-models", timeout=15)
        r.raise_for_status()
    except Exception as e:
        logging.error("Could not reach Automatic1111 API at %s.\n"
                      "Make sure WebUI is running with --api.\nError: %s", api_url, e)
        sys.exit(2)

def a1111_txt2img(api_url: str, prompt: str, negative: str, width: int, height: int,
                  steps: int, cfg: float, sampler: str, seed: Optional[int],
                  model_checkpoint: Optional[str]):
    payload = {
        "prompt": prompt,
        "negative_prompt": negative,
        "width": width,
        "height": height,
        "steps": steps,
        "cfg_scale": cfg,
        "sampler_name": sampler,
    }
    if seed is not None:
        payload["seed"] = int(seed)

    if model_checkpoint:
        payload["override_settings"] = {"sd_model_checkpoint": model_checkpoint}

    logging.debug("txt2img payload: %s", payload)

    r = requests.post(f"{api_url}/sdapi/v1/txt2img", json=payload, timeout=300)
    r.raise_for_status()
    j = r.json()
    if not j.get("images"):
        raise RuntimeError("No image returned from API.")
    img_b64 = j["images"][0]
    if "," in img_b64:  # sometimes "data:image/png;base64,...."
        img_b64 = img_b64.split(",", 1)[1]
    img_bytes = base64.b64decode(img_b64)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")  # drop alpha for smaller web artifacts
    return img, j.get("info", "")

def embed_png_metadata(pil_img: Image.Image, metadata: dict) -> PngImagePlugin.PngInfo:
    info = PngImagePlugin.PngInfo()
    for k, v in metadata.items():
        if v is not None:
            info.add_text(str(k), str(v))
    return info

def save_derivatives(base_img: Image.Image, base_name: str, outdir: Path,
                     verbose: bool, prompt: str, negative: str, seed: Optional[int]):
    """
    Save WebP versions only (no PNG fallback)
    """
    # Save multiple WebP sizes
    for size in WEBP_SIZES:
        if size == base_img.width:
            # Use original if it matches
            webp_img = base_img
        else:
            # Resize maintaining aspect ratio
            webp_img = base_img.resize((size, size), Image.Resampling.LANCZOS)
        
        # Determine filename
        if size == WEBP_SIZES[0]:  # First size is the "main" one
            webp_path = outdir / f"{base_name}.webp"
        else:
            webp_path = outdir / f"{base_name}-{size}.webp"
        
        # Save WebP with metadata
        webp_img.save(
            webp_path,
            "WebP",
            quality=WEBP_QUALITY,
            method=6,  # Best compression
            # Add metadata as EXIF
            exif=webp_img.getexif() if hasattr(webp_img, 'getexif') else None
        )
        
        if verbose:
            file_size = webp_path.stat().st_size // 1024
            logging.info("    → %s (%d KB)", webp_path.name, file_size)


# -----------------------------
# Main
# -----------------------------
def main():
    p = argparse.ArgumentParser(description="Generate kid-friendly vocabulary images from CSV via Automatic1111.")
    p.add_argument("csv", help="Path to CSV with headers: 普通中文, 客家汉字, Hakka Pronunciation, English Definition")
    p.add_argument("--api-url", default=DEFAULT_API_URL, help=f"Automatic1111 API URL (default: {DEFAULT_API_URL})")
    p.add_argument("--outdir", default=DEFAULT_OUTDIR, help=f"Output directory (default: {DEFAULT_OUTDIR})")
    p.add_argument("--width", type=int, default=DEFAULT_WIDTH, help=f"Base render width (default: {DEFAULT_WIDTH})")
    p.add_argument("--height", type=int, default=DEFAULT_HEIGHT, help=f"Base render height (default: {DEFAULT_HEIGHT})")
    p.add_argument("--steps", type=int, default=DEFAULT_STEPS, help=f"Sampling steps (default: {DEFAULT_STEPS})")
    p.add_argument("--cfg", type=float, default=DEFAULT_CFG, help=f"CFG scale (default: {DEFAULT_CFG})")
    p.add_argument("--sampler", default=DEFAULT_SAMPLER, help=f"Sampler (default: {DEFAULT_SAMPLER})")
    p.add_argument("--model", default=None, help="Optional: exact SDXL checkpoint name in A1111 to force-load")
    p.add_argument("--seed-base", type=int, default=1000, help="Base seed (incremented per row). Use fixed for stable style.")
    p.add_argument("--overwrite", action="store_true", help="Re-generate even if files exist")
    p.add_argument("--test", action="store_true", help="Generate at most 5 examples (for a quick sanity check)")
    p.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")

    args = p.parse_args()
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(message)s")

    outdir = Path(args.outdir)
    ensure_api_alive(args.api_url)

    # Read CSV (UTF-8 with BOM tolerant)
    try:
        with open(args.csv, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
    except FileNotFoundError:
        logging.error("CSV not found: %s", args.csv)
        sys.exit(1)

    # Light validation
    required = {HDR_ZH, HDR_HAKKA_HANZI, HDR_HAKKA_PRON, HDR_ENG}
    missing = [h for h in required if h not in rows[0].keys()]
    if missing:
        logging.error("CSV is missing expected headers: %s", ", ".join(missing))
        sys.exit(1)

    limit = 1 if args.test else None
    count = 0
    for i, row in enumerate(rows, start=1):
        if limit is not None and count >= limit:
            break

        zh = (row.get(HDR_ZH) or "").strip()
        hanzi = (row.get(HDR_HAKKA_HANZI) or "").strip()
        eng = (row.get(HDR_ENG) or "").strip()

        if not eng or not hanzi:
            if args.verbose:
                logging.info("Skipping row %d (missing English or 客家汉字)", i)
            continue

        base_name = safe_filename(hanzi)
        png_target = outdir / f"{base_name}.png"
        webp_target = outdir / f"{base_name}.webp"
        webp_mobile_target = outdir / f"{base_name}-512.webp"

        if not args.overwrite and png_target.exists() and webp_target.exists() and webp_mobile_target.exists():
            if args.verbose:
                logging.info("Skipping existing: %s", base_name)
            count += 1
            continue

        prompt = PROMPT_TEMPLATE.format(english=eng)
        seed = args.seed_base + i

        if args.verbose:
            logging.info("Row %d", i)
            logging.info("  客家汉字: %s", hanzi)
            logging.info("  English : %s", eng)
            logging.info("  Prompt  : %s", prompt)
            logging.info("  Negative: %s", NEGATIVE)
            logging.info("  Seed    : %s", seed)

        # Generate base image (no overlay text; you’ll add text on your site)
        img, info = a1111_txt2img(
            api_url=args.api_url,
            prompt=prompt,
            negative=NEGATIVE,
            width=args.width,
            height=args.height,
            steps=args.steps,
            cfg=args.cfg,
            sampler=args.sampler,
            seed=seed,
            model_checkpoint=args.model,
        )

        # Save web derivatives with web-first strategy
        save_derivatives(
            base_img=img, base_name=base_name, outdir=outdir,
            verbose=args.verbose, prompt=prompt, negative=NEGATIVE, seed=seed
        )

        count += 1

    if args.verbose:
        logging.info("Done. Generated %d item(s). Output: %s", count, outdir)


if __name__ == "__main__":
    main()
