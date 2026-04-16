"""Manifest manager for vocab image generation.

Handles reading, writing, and updating the JSON manifest that maps
English definitions to their corresponding image slugs and paths.
"""

import json
import os
import tempfile
from pathlib import Path

# Default manifest path relative to the repo root
DEFAULT_MANIFEST_PATH = Path("src/data/vocab-image-manifest.json")


class Manifest:
    """Manages the vocab image manifest JSON file.

    Manifest structure:
        {
            "Sun":        {"slug": "sun",    "image": "vocab-images/sun.png"},
            "Rain (v.)":  {"slug": "rain-v", "image": "vocab-images/rain-v.png"},
            ...
        }
    """

    def __init__(self, manifest_path: str | Path):
        self.path = Path(manifest_path)
        self._data: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        """Load existing manifest from disk, or start empty."""
        if self.path.exists():
            try:
                with open(self.path, 'r', encoding='utf-8') as f:
                    self._data = json.load(f)
            except (json.JSONDecodeError, ValueError):
                self._data = {}
        else:
            self._data = {}

    @property
    def data(self) -> dict[str, dict]:
        """Read-only access to the manifest data."""
        return self._data

    def has(self, english: str) -> bool:
        """Check if an English definition already has a manifest entry."""
        return english in self._data

    def add(self, english: str, slug: str, image_path: str) -> None:
        """Add or update a manifest entry.

        Args:
            english: The English definition (key).
            slug: The sanitized filename slug.
            image_path: Relative path to the image (e.g., 'vocab-images/sun.png').
        """
        self._data[english] = {
            "slug": slug,
            "image": image_path,
        }

    def remove(self, english: str) -> None:
        """Remove a manifest entry."""
        self._data.pop(english, None)

    def save(self) -> None:
        """Atomically save the manifest to disk.

        Writes to a temporary file first, then renames to the target path.
        This prevents partial writes from corrupting the manifest.
        """
        self.path.parent.mkdir(parents=True, exist_ok=True)

        # Write to a temp file in the same directory for atomic rename
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=str(self.path.parent),
            prefix='.manifest-',
            suffix='.tmp'
        )
        try:
            with os.fdopen(tmp_fd, 'w', encoding='utf-8') as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False)
                f.write('\n')
            # Atomic replace (works on Windows with os.replace)
            os.replace(tmp_path, str(self.path))
        except Exception:
            # Clean up temp file on failure
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    def __len__(self) -> int:
        return len(self._data)

    def __contains__(self, english: str) -> bool:
        return self.has(english)

    def __repr__(self) -> str:
        return f"Manifest({self.path}, {len(self._data)} entries)"
