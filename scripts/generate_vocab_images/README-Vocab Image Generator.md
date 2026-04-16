# Vocab Image Generator

Generates flashcard-quality illustrations for every English definition in the Hakka Vocabulary CSV using **FLUX.1-schnell** via a local **ComfyUI** server.

Each unique English definition produces a single 512x512 PNG — a flat, vector-like icon on a white background with no text or watermarks. The generator is **idempotent**: existing images are never overwritten unless you explicitly pass `--force`.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Python 3.10+** | Standard library + `requests` |
| **ComfyUI** | Running locally with the HTTP API enabled (default port 8188) |
| **FLUX.1-schnell model** | Loaded in ComfyUI as `flux1-schnell.safetensors` |

> If your checkpoint file has a different name, update `ckpt_name` in [workflow.json](workflow.json).

---

## Quick Start

```bash
# 1. Install dependencies (from this directory)
pip install -r requirements.txt

# 2. Start ComfyUI (in a separate terminal)
#    Ensure FLUX.1-schnell is available and the API is listening on port 8188

# 3. Preview what would be generated (no images created)
python generate.py --dry-run

# 4. Generate all missing images
python generate.py

# 5. Verify manifest completeness
python ../verify_manifest.py
```

---

## CLI Reference

```
python generate.py [OPTIONS]
```

| Flag | Default | Description |
|---|---|---|
| `--dry-run` | off | Preview what would be generated without calling ComfyUI |
| `--force` | off | Regenerate all images, even if they already exist on disk |
| `--comfyui-url URL` | `http://127.0.0.1:8188` | ComfyUI server address |
| `--batch-size N` | `10` | Save a manifest checkpoint every N images |
| `--seed N` | `42` | Base seed for reproducible generation (each image gets `seed + index`) |
| `--csv PATH` | `../../Hakka Vocabulary.csv` | Path to the vocabulary CSV |
| `--lowram` | off | Sleep between each generation to reduce system load and keep the workstation responsive |
| `--lowram-delay N` | `3.0` | Seconds to sleep between generations when `--lowram` is active |

---

## How It Works

1. **Load CSV** -- Reads `Hakka Vocabulary.csv` and extracts the `English Definition` column.
2. **Deduplicate** -- Keeps only the first occurrence of each English definition (126 duplicates skipped from ~2370 rows).
3. **Slugify** -- Converts each definition to a filesystem-safe slug (e.g., `Rain (v.)` becomes `rain-v`).
4. **Check existence** -- If `public/vocab-images/<slug>.png` already exists, skip.
5. **Build prompt** -- Uses a style template for nouns (`"a single {term}, ..."`) or an abstract template for verbs/adjectives (`"depict the concept of {term} using a simple icon, ..."`).
6. **Generate** -- Sends the prompt to ComfyUI via its HTTP API, polls until complete, downloads the PNG.
7. **Update manifest** -- Writes `src/data/vocab-image-manifest.json` atomically (temp file + rename).

---

## File Structure

```
scripts/generate_vocab_images/
  generate.py          # Main entry point (this script)
  prompts.py           # Prompt template builder (noun vs. abstract detection)
  slugify_util.py      # English definition -> filesystem-safe slug
  manifest.py          # Atomic JSON manifest reader/writer
  overrides.json       # Manual prompt overrides (edit to customize specific terms)
  workflow.json        # ComfyUI API-format workflow for FLUX.1-schnell
  requirements.txt     # Python dependencies
  providers/
    __init__.py
    comfyui.py         # ComfyUI HTTP API client

scripts/
  verify_manifest.py   # CI guardrail: checks CSV-to-manifest completeness

public/vocab-images/   # Output directory for generated PNGs (gitignored)
src/data/vocab-image-manifest.json  # Maps English definitions to image paths (committed)
```

---

## Prompt Customization

### Automatic style

All prompts append a consistent style suffix:

> centered, plain white background, no text, no watermark, flat vector-like illustration, high contrast, simple shapes, clear silhouette

Verbs and adjectives (detected by `(v.)`, `(adj.)`, or keyword matching) use:

> depict the concept of {term} using a simple icon, ...

### Manual overrides

Edit [overrides.json](overrides.json) to set a custom prompt for any definition. The key must match the exact `English Definition` from the CSV:

```json
{
  "The milky way": "a swirling galaxy viewed from space, centered, plain white background, no text, flat vector-like illustration",
  "Solar eclipse": "the moon covering the sun with a corona glow, centered, plain white background, flat illustration"
}
```

If your override already contains style keywords like `background` or `illustration`, it is used as-is. Otherwise, the standard style suffix is appended automatically.

---

## ComfyUI Workflow

The included [workflow.json](workflow.json) is a minimal text-to-image pipeline:

- **Checkpoint**: `flux1-schnell.safetensors` (via `CheckpointLoaderSimple`)
- **Resolution**: 512x512
- **Steps**: 4 (schnell is designed for very few steps)
- **Sampler**: euler / simple scheduler
- **CFG**: 1.0

### Adapting the workflow

If your ComfyUI setup uses a different loader pattern (e.g., `UNETLoader` + `DualCLIPLoader` instead of `CheckpointLoaderSimple`), export your working workflow from the ComfyUI web UI using **Save (API Format)** and replace `workflow.json` with the exported file. The generator will inject the prompt text into any `CLIPTextEncode` node and the seed into any `KSampler` node it finds.

---

## Image Hosting

Generated images land in `public/vocab-images/` which is **gitignored** to avoid bloating the repository (~2243 images at 200-500 KB each = 0.5-1.2 GB). You need to host them separately.

### Option A: GitHub Releases (simple)

1. Compress the images:
   ```bash
   tar -czf vocab-images.tar.gz -C public vocab-images/
   ```
2. Create a GitHub Release and attach `vocab-images.tar.gz`.
3. For serving, extract and host via any static server, or use GitHub release asset URLs directly.

### Option B: Cloudflare R2 / AWS S3 (recommended for production)

1. Create a bucket (R2 is free for reasonable traffic).
2. Upload the `public/vocab-images/` folder.
3. Set `IMAGE_BASE_URL` in `app.js` to your bucket's public URL:
   ```javascript
   const IMAGE_BASE_URL = 'https://your-bucket.r2.dev';
   ```

### Option C: GitHub Pages (not recommended)

1. Create a separate `gh-pages-assets` branch.
2. Copy `public/vocab-images/` into it and push.
3. Set `IMAGE_BASE_URL` to `https://yourusername.github.io/Hakka-flashcards-site`.

### Option D: Netlify / Vercel (deploy the whole site)

If you deploy the site itself to Netlify or Vercel, include the `public/` folder in your deploy. Images serve from the same domain with no extra config needed — leave `IMAGE_BASE_URL` as `''`.

### Local development

For local development, images serve directly from the filesystem. The default `IMAGE_BASE_URL = ''` in `app.js` resolves paths relative to the HTML file, looking for `public/vocab-images/<slug>.png`.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `Cannot connect to ComfyUI` | Ensure ComfyUI is running and listening on port 8188. Check with `curl http://127.0.0.1:8188/system_stats`. This sometimes defaults to port 8000 but I find that always conflicts with other things I'm working on. |
| `Workflow template not found` | Run the script from the repo root, or pass the correct `--csv` path. The workflow is loaded from the same directory as `generate.py`. |
| `No image output found` | Your ComfyUI workflow may not have a `SaveImage` node. Re-export from ComfyUI in API format. |
| `Timed out after 120s` | FLUX.1-schnell should finish in seconds. Check ComfyUI logs for GPU memory issues or model loading errors. |
| Images look wrong | Edit [overrides.json](overrides.json) to provide a better prompt for specific terms, then re-run with `--force`. |
| Duplicate slug collision | The slugifier is deterministic. If two different definitions produce the same slug (unlikely due to the dedup step), add one to `overrides.json` or adjust `slugify_util.py`. |
