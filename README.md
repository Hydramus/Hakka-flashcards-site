# Hong Kong Fui Yong Hakka — Study

A web-based flashcard application for learning Hong Kong Fui Yong Hakka vocabulary. This application provides multiple study modes including flashcards, multiple choice, and typing exercises with spaced repetition system (SRS) for optimal learning.

## Features

### 🎯 Study Modes
- **Flashcards**: Traditional spaced repetition flashcards with SRS scheduling
- **Multiple Choice**: Practice with randomized answer options
- **Typing**: Type answers in English, Mandarin, or Hakka pronunciation
- **Review Mode**: Review learned words, mistakes, and cards due today

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
- **CSV Import**: Import vocabulary from CSV files
- **Progress Export/Import**: Backup and restore your learning progress
- **Local Storage**: All progress saved locally in your browser

## Usage

### Getting Started

1. **Open the Application**
   - Open `index.html` in any modern web browser
   - No installation or server setup required

2. **Import Vocabulary**
   - The app comes with a default Hakka vocabulary CSV file (`Hakka Vocabulary.csv`)
   - To add custom vocabulary:
     - Go to the "Import/Export" tab
     - Use the CSV import feature with the required format:
       ```csv
       普通中文,客家汉字,Hakka Pronunciation,English Definition
       太陽,日頭,ngit5 teu2,Sun
       月亮,月光,ngiet6 gong1,Moon
       ```

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
  - View overall statistics
  - Search through all vocabulary
  - Track session and lifetime progress
  - Browse the complete word list

### Import/Export Data

#### Importing CSV Vocabulary
1. Go to "Import/Export" tab
2. Either:
   - Paste CSV text directly into the text area, OR
   - Use "Choose File" to select a CSV file
3. Click "Import" to add the vocabulary

#### Backup/Restore Progress
1. **Export**: Click "Export Progress" to download your learning data
2. **Import**: Use "Choose File" and "Import Progress" to restore from a backup

## File Structure

```
Hakka-flashcards-site/
├── index.html          # Main application interface
├── app.js             # Core application logic and SRS algorithm  
├── style.css          # Styling and themes
├── Hakka Vocabulary.csv # Default vocabulary dataset
└── README.md          # This documentation
```

## Technical Details

### Browser Compatibility
- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- Uses localStorage for data persistence
- No server or internet connection required

### Data Storage
- All progress is stored locally in your browser's localStorage
- No data is sent to external servers
- Export your progress regularly to avoid data loss

### SRS Algorithm
The spaced repetition system uses a modified Anki algorithm:
- Cards start with short intervals (0.5-4 days)
- Intervals increase based on performance ratings
- Failed cards reset to shorter intervals
- Ease factor adjusts based on performance history

## CSV Format

When importing vocabulary, use this exact header format:

```csv
普通中文,客家汉字,Hakka Pronunciation,English Definition
```

**Column Descriptions:**
- `普通中文`: Standard Chinese/Mandarin characters
- `客家汉字`: Hakka Chinese characters  
- `Hakka Pronunciation`: Romanized pronunciation with tone numbers (1-6)
- `English Definition`: English translation

**Example:**
```csv
普通中文,客家汉字,Hakka Pronunciation,English Definition
太陽,日頭,ngit5 teu2,Sun
月亮,月光,ngiet6 gong1,Moon
星星,星,sin1,Star
```
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
