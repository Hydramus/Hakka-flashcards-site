"""Filename slugifier for vocab image generation.

Converts English definitions into safe, filesystem-friendly slugs.
Handles edge cases: fullwidth parens, illegal characters, long strings,
punctuation, and mixed formatting from the Hakka vocabulary CSV.
"""

import hashlib
import re
import unicodedata

# Characters illegal in Windows/macOS/Linux filenames
ILLEGAL_CHARS = re.compile(r'[/\\:*?"<>|]')
# Anything that isn't alphanumeric or hyphen after normalization
NON_SLUG_CHARS = re.compile(r'[^a-z0-9-]')
# Collapse consecutive hyphens
MULTI_HYPHEN = re.compile(r'-{2,}')

MAX_SLUG_LENGTH = 80


def slugify(english_definition: str) -> str:
    """Convert an English definition string into a safe filename slug.

    Rules:
        - Normalize fullwidth parentheses to ASCII
        - Strip illegal filesystem characters
        - Lowercase, replace spaces/punctuation with hyphens
        - Collapse consecutive hyphens, strip leading/trailing hyphens
        - Truncate at MAX_SLUG_LENGTH chars; if truncated, append
          first 6 chars of SHA-256 of the original definition for stability

    Examples:
        "Sun"                        -> "sun"
        "Rain (v.)"                  -> "rain-v"
        "Rain（n.）"                  -> "rain-n"
        "Flatland, plain"            -> "flatland-plain"
        "Cool and nice(weather)"     -> "cool-and-nice-weather"
        "River (discharging into the sea)" -> "river-discharging-into-the-sea"
    """
    text = english_definition.strip()
    if not text:
        return ""

    # Normalize Unicode (NFKC collapses fullwidth chars to ASCII equivalents)
    text = unicodedata.normalize('NFKC', text)

    # Lowercase
    text = text.lower()

    # Remove periods, trailing dots
    text = text.replace('.', '')

    # Replace illegal filesystem characters with nothing
    text = ILLEGAL_CHARS.sub('', text)

    # Replace spaces, commas, parentheses, and other separators with hyphens
    text = text.replace(' ', '-')
    text = text.replace(',', '-')
    text = text.replace('(', '-')
    text = text.replace(')', '')
    text = text.replace('[', '-')
    text = text.replace(']', '')
    text = text.replace('{', '-')
    text = text.replace('}', '')
    text = text.replace("'", '')
    text = text.replace(';', '-')
    text = text.replace('&', 'and')
    text = text.replace('+', 'plus')

    # Remove anything that isn't alphanumeric or hyphen
    text = NON_SLUG_CHARS.sub('', text)

    # Collapse multiple hyphens
    text = MULTI_HYPHEN.sub('-', text)

    # Strip leading/trailing hyphens
    text = text.strip('-')

    if not text:
        # Fallback: hash the original definition
        hash_val = hashlib.sha256(english_definition.encode('utf-8')).hexdigest()[:8]
        return f"term-{hash_val}"

    # Truncate if needed, appending a stable hash suffix for uniqueness
    if len(text) > MAX_SLUG_LENGTH:
        hash_suffix = hashlib.sha256(english_definition.encode('utf-8')).hexdigest()[:6]
        text = text[:MAX_SLUG_LENGTH - 7] + '-' + hash_suffix

    return text
