"""Prompt builder for vocab image generation.

Constructs styled prompts for FLUX.1-schnell that produce clean,
simple, icon-like illustrations suitable for flashcards.
"""

import json
import os
import re

# Style suffix appended to all prompts
STYLE_SUFFIX = (
    "centered, plain white background, no text, no watermark, "
    "flat vector-like illustration, high contrast, simple shapes, "
    "clear silhouette, avoid: words, letters, logos, brand names, "
    "watermark, background scene, people, hands"
)

# Patterns that indicate non-noun (verb, adjective, abstract concept)
VERB_ADJECTIVE_PATTERNS = [
    r'\(v\.?\)',        # (v.) or (v)
    r'\(adj\.?\)',      # (adj.) or (adj)
    r'\(adv\.?\)',      # (adv.) or (adv)
]

# Keywords that suggest abstract/verb/adjective concepts
ABSTRACT_KEYWORDS = {
    'hot', 'cold', 'cool', 'warm', 'freeze', 'frozen',
    'blow', 'blows', 'melt', 'stops', 'caught',
    'overcast', 'sunny', 'stuffy', 'drought',
    'flood', 'against',
}

# Compiled patterns
_VERB_ADJ_RE = re.compile('|'.join(VERB_ADJECTIVE_PATTERNS), re.IGNORECASE)


def _is_abstract(english: str) -> bool:
    """Determine if an English definition represents an abstract concept."""
    if _VERB_ADJ_RE.search(english):
        return True
    # Check if any word in the definition is an abstract keyword
    words = set(re.findall(r'[a-zA-Z]+', english.lower()))
    return bool(words & ABSTRACT_KEYWORDS)


def _clean_term(english: str) -> str:
    """Strip parenthesized qualifiers for cleaner prompt insertion.

    'Rain (v.)' -> 'rain'
    'Hail(n.)' -> 'hail'
    'Cool and nice(weather)' -> 'cool and nice'
    """
    # Remove parenthesized qualifiers like (v.), (n.), (weather)
    cleaned = re.sub(r'\s*[\(（][^)）]*[\)）]', '', english)
    return cleaned.strip()


def load_overrides(overrides_path: str) -> dict:
    """Load manual prompt overrides from a JSON file.

    Returns a dict mapping English Definition -> full prompt string.
    """
    if not os.path.exists(overrides_path):
        return {}
    with open(overrides_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_prompt(english: str, overrides: dict | None = None) -> str:
    """Build an image generation prompt for the given English definition.

    Args:
        english: The English definition from the vocabulary CSV.
        overrides: Optional dict of manual prompt overrides keyed by definition.

    Returns:
        A formatted prompt string for the image generation model.
    """
    # Check for manual override first
    if overrides and english in overrides:
        override = overrides[english]
        # If override already includes style info, use as-is
        if 'background' in override.lower() or 'illustration' in override.lower():
            return override
        # Otherwise append style suffix
        return f"{override}, {STYLE_SUFFIX}"

    term = _clean_term(english)
    if not term:
        term = english

    if _is_abstract(english):
        prompt = f"depict the concept of {term} using a simple icon, {STYLE_SUFFIX}"
    else:
        prompt = f"a single {term}, {STYLE_SUFFIX}"

    return prompt
