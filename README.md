# Hong Kong Fui Yong Hakka — Study

A web-based flashcard application for learning Hong Kong Fui Yong Hakka vocabulary. This application provides multiple study modes including flashcards, multiple choice, and typing exercises with spaced repetition system (SRS) for optimal learning.

## Features

### 🎯 Study Modes
- **Flashcards**: Traditional spaced repetition flashcards with SRS scheduling
- **Multiple Choice**: Practice with randomized answer options
- **Typing**: Type answers in English, Mandarin, or Hakka pronunciation
- **Review Mode**: Review learned words, mistakes, and cards due today

### 📚 Sets
The vocabulary corpus is split into themed sets, each backed by a CSV file in `Hakka Dictionary/`:

- **Core Vocabulary** — `Hakka Vocabulary.csv`
- **2 Character Idioms (兩字熟語)** — `flashcards-兩字熟語.csv`
- **3 Character Idioms (三字熟語)** — `flashcards-三字熟語.csv`
- **4 Character Idioms (四字熟語)** — `flashcards-四字熟語.csv`
- **5+ Character Phrases (五字以上)** — `flashcards-五字以上.csv`
- **Slang & Riddles (歇後語謎語)** — `flashcards-歇後語謎語.csv`
- **All** — synthetic option that pools every set together

A global picker above the tabs chooses the active set. Flashcards, Multiple Choice, Typing, and Reviewing all scope to it. Vocabulary search always covers every set. SRS progress is per-card and unified — words shared between sets share progress. Switching mid-card discards the in-flight card without rating it.

### 🎨 Visual Learning
- **Tone Coloring**: Each Hakka tone (1-6) is color-coded for visual learning
  - Tone 1: Red
  - Tone 2: Blue  
  - Tone 3: Green
  - Tone 4: Purple
  - Tone 5: Orange
  - Tone 6: Yellow
- **Diacritics**: Pronunciation displays with proper tone diacritics

- **Tone Diacritic Conversion**:  
  Converts tone numbers (e.g., `ngai2`) into diacritic forms (e.g., `ngái`) using mappings inspired by the "香港客家话研究" textbook.

|           | 陰平    | 陽平   | 上     | 去     | 陰入   | 陽入   |
|-----------|---------|--------|--------|--------|--------|--------|
| 調值      | 13*/35  | 11     | 31     | 53/55  | 31     | 53     |
| 例字      | 參芬聲  | 蠶焚成 | 慘粉省 | 杉份盛 | 插忽析 | 雜佛石 |
| 標調符號  | ˊ       | ̄      | ̌       | ˋ      | ̌      | ˋ      |
| 標調數字  | 1       | 2      | 3      | 4      | 5      | 6      |

- **Dark/Light Mode**: Toggle between themes for comfortable studying

### 📊 Progress Tracking
- **Session Counter**: Track vocabulary learned in current session
- **Lifetime Counter**: Total vocabulary learned across all sessions
- **Statistics**: View due cards, new cards, review cards, and total vocabulary
- **SRS Scheduling**: Intelligent spaced repetition based on your performance
- **Progress**: Progress is all stored in your local browser cache so it will reset if you move to another computer or browser

### 📁 Data Management
- **Backup**: Export and import your learning progress as JSON
- **Local Storage**: All progress saved locally in your browser (OPFS with localStorage fallback) — survives "Clear browsing data" in modern browsers

## Usage

### Getting Started

1. **Open the Application**
   - Open `index.html` in any modern web browser
   - No installation or server setup required

2. **First-time setup**
   - On your first visit you'll see a welcome modal asking which set to start with. Core Vocabulary is highlighted as the default.
   - You can change the active set any time via the **Set** picker above the tabs.
   - To add new sets, drop a CSV into `Hakka Dictionary/` and rerun the manifest script (see [Adding new sets](#adding-new-sets)).

### Study Modes

#### Flashcards
1. Click the "Flashcards" tab
2. A Hakka character or English word will be displayed
3. Think of the answer, then click "Show" to reveal it
4. Rate your knowledge:
   - **Again**: You didn't know it (card appears sooner)
   - **Hard**: You struggled (slightly longer interval)
   - **Good**: You knew it well (normal interval)
   - **Easy**: You knew it perfectly (longer interval)

#### Multiple Choice
1. Click the "Multiple Choice" tab
2. Select the correct answer from 4 options
3. Immediate feedback shows if you're correct
4. Click "Next" to continue

#### Typing Practice
1. Click the "Typing" tab
2. Choose what to type in the dropdown:
   - English
   - Mandarin (普通中文)
   - Hakka pronunciation
3. Type your answer and press Enter
4. Get immediate feedback on accuracy

#### Review Mode
1. Click the "Reviewing" tab
2. Filter to view:
   - **Learned**: Cards you've studied
   - **Mistakes**: Cards you got wrong
   - **Due Today**: Cards scheduled for review
3. Browse your progress and identify areas for improvement

### Statistics and Vocabulary Browser
- Click the "Vocabulary" tab to:
  - View overall statistics for the active set (in the picker row)
  - Search across **every** set — search results show set-membership badges per word
  - Track session and lifetime progress
  - Browse the complete word list

### Backup

The **Backup** tab provides JSON export/import for your local progress.

1. **Export**: Click "Export Progress" to download a JSON file with your full SRS state.
2. **Import**: Use "Choose File" and "Import Progress" to restore from a backup. Older v1 backups are auto-migrated to the v2 card-pool shape.

> Manual CSV import was removed. Add new vocabulary by dropping CSV files into `Hakka Dictionary/` and rerunning the manifest script — see below.

## Adding new sets

1. Drop a new CSV into `Hakka Dictionary/` using either schema:
   - **Main schema** (Mandarin word column): `普通中文,客家汉字,Hakka Pronunciation,English Definition`
   - **Idiom schema** (longer Chinese explanation): `客家汉字,Hakka Pronunciation,Chinese definition,English Definition`
2. If the file uses diacritic pronunciation (`á mĕ`), convert it to the tone-number form the runtime expects:
   ```bash
   .venv/Scripts/python.exe scripts/diacritic_to_tonenum.py
   ```
   The script is idempotent, backs originals up to `Hakka Dictionary/_backup_diacritic/`, and writes a `scripts/conversion_report.txt` with per-file counts and any anomalies for review.
3. Regenerate the manifest the front end fetches:
   ```bash
   .venv/Scripts/python.exe scripts/build_manifest.py
   ```
   This rewrites `Hakka Dictionary/manifest.json`. Display names come (in priority order) from `Hakka Dictionary/manifest.overrides.json` if present, then a built-in map, then a prettify fallback.
4. Refresh the page. The new set appears in the picker without code changes.

## File Structure

```
Hakka-flashcards-site/
├── index.html                         # Main application interface
├── app.js                             # Core application logic, SRS, set picker
├── style.css                          # Styling and themes
├── Hakka Dictionary/
│   ├── manifest.json                  # Auto-generated set manifest
│   ├── manifest.overrides.json        # Optional display-name overrides
│   ├── Hakka Vocabulary.csv           # Core vocabulary (main schema)
│   ├── flashcards-兩字熟語.csv         # 2-character idioms (idiom schema)
│   ├── flashcards-三字熟語.csv         # 3-character idioms
│   ├── flashcards-四字熟語.csv         # 4-character idioms
│   ├── flashcards-五字以上.csv         # 5+ character phrases
│   ├── flashcards-歇後語謎語.csv       # Slang & riddles
│   └── _backup_diacritic/             # Pre-conversion backups (idiom CSVs)
├── scripts/
│   ├── build_manifest.py              # Regenerate manifest after CSV changes
│   ├── diacritic_to_tonenum.py        # One-shot diacritic→tone-number converter
│   └── conversion_report.txt          # Last conversion run summary
└── README.md                          # This documentation
```

## Technical Details

### Browser Compatibility
- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- Uses localStorage for data persistence
- No server or internet connection required

### Data Storage
- Progress is stored locally in your browser. Primary store is **OPFS** (Origin Private File System) — survives "Clear browsing data" in Chrome/Edge/Firefox 111+. localStorage is mirrored as a backup.
- Storage key: `srs_cards_v2` (one entry per unique card, keyed by `hakka_chars + pronunciation`).
- Older `srs_decks_v1` data auto-migrates on first load and is preserved as `srs_decks_v1_backup`.
- No data is sent to external servers.
- Export your progress regularly to avoid data loss.

### SRS Algorithm
The spaced repetition system uses a modified Anki algorithm:
- Cards start with short intervals (0.5-4 days)
- Intervals increase based on performance ratings
- Failed cards reset to shorter intervals
- Ease factor adjusts based on performance history

## CSV Format

Two schemas are supported. The schema is auto-detected from the header by `scripts/build_manifest.py`.

### Main schema (Mandarin word)
```csv
普通中文,客家汉字,Hakka Pronunciation,English Definition
太陽,日頭,ngit5 teu2,Sun
月亮,月光,ngiet6 gong1,Moon
```

### Idiom schema (Chinese explanation)
```csv
客家汉字,Hakka Pronunciation,Chinese definition,English Definition
阿姆,a1 me3,,"Mother / exclamation 'Look!'"
```

**Column descriptions**
- `普通中文` *(main only)*: Standard Chinese/Mandarin word
- `客家汉字`: Hakka Chinese characters
- `Hakka Pronunciation`: Romanized pronunciation with tone numbers (1–6). If a CSV uses diacritics (`á mĕ`), run `scripts/diacritic_to_tonenum.py` once to convert it before adding it to the manifest.
- `Chinese definition` *(idiom only)*: Longer Chinese explanation rendered as `中文釋義:` on the back of the card
- `English Definition`: English translation

Cards are deduplicated across CSVs by the composite key `hakka_chars + pronunciation`. A word that appears in two CSVs becomes one card with two set memberships, sharing one SRS state.

## Contributing

To contribute vocabulary or improvements:
1. Fork the repository
2. Add vocabulary to the CSV file or make code improvements
3. Submit a pull request

## References

**Source Material**:  
"香港客家话研究" by **劉鎮發 (liu2 zin3 fat5)** – provides the tone and language basis for the diacritic conversion.

**Fui Yong Hakka TTS Model & API**:

- **Hong Kong Hakka TTS**: [https://hkilang.github.io/TTS/](https://hkilang.github.io/TTS/)
- **Source Code**: [https://github.com/hkilang/TTS/tree/main](https://github.com/hkilang/TTS/tree/main)
- **TTS API**: [https://github.com/hkilang/TTS-API/tree/main](https://github.com/hkilang/TTS-API/tree/main)
- Special thanks to https://github.com/graphemecluster for his assistance, for pointing me in the right direction, and for creating the TTS application.

## License

This project is MIT open source license. Feel free to use, modify, and distribute as needed for educational purposes.
