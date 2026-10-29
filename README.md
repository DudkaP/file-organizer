# File Organizer

Консольна утиліта на Node.js для наведення порядку в папках (наприклад, у Downloads). Дозволяє просканувати директорію, знайти дублікати файлів, розсортувати файли по папках за типами та видалити старі непотрібні файли.

Проєкт виконано в рамках першого модуля курсу Node.js.

## Встановлення та запуск

Для роботи потрібен встановлений Node.js (версії 18+ або 20+). Зовнішні бібліотеки не використовуються, все працює на стандартних модулях (`fs`, `path`, `crypto`, `events`, `stream`).

1. Склонуйте репозиторій:
```bash
git clone <посилання-на-репозиторій>
cd file-organizer
```

2. Запускати можна напряму через `node` або через npm-скрипти:
```bash
node file-organizer.js <команда> [аргументи]
```
або:
```bash
npm run scan -- /path/to/dir
```

## Опис команд

### 1. `scan` — сканування папки та статистика

Рекурсивно проходить по вказаній папці та всіх вкладених підпапках. Виводить загальну кількість і розмір файлів, статистику за розширеннями, віком (за останні 7, 30 та більше 90 днів), топ-3 найбільших файли і найстаріший файл.

Як запустити:
```bash
node file-organizer.js scan ./Downloads
```
Аргументи:
- `./Downloads` — шлях до папки, яку треба проаналізувати.

Приклад роботи:
```text
📂 Scanning: ./Downloads
Processing... ████████████████████ 11/11 files

📊 Scan Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total files: 11
Total size: 11.2 MB

By File Type:
  .mp4    1 files    11.0 MB
  .pdf    4 files    150.0 KB
  .png    2 files    40.0 KB
  .zip    1 files    10.0 KB
  .js     1 files    0.0 KB

File Age:
  Last 7 days:    9 files
  Last 30 days:   9 files
  Older than 90:  2 files

Largest files:
  1. movie.mp4              11.0 MB
  2. lecture.pdf            50.0 KB
  3. lecture_copy.pdf       50.0 KB

Oldest file: ancient.txt (modified 365 days ago)
```

### 2. `duplicates` — пошук дублікатів

Шукає файли з однаковим вмістом незалежно від їхньої назви. Для кожного файлу через потоки (`fs.createReadStream`) рахується хеш SHA-256. Якщо хеші збігаються, файли групуються і показується, скільки місця витрачається на зайві копії.

Як запустити:
```bash
node file-organizer.js duplicates ./Downloads
```
Аргументи:
- `./Downloads` — папка, в якій шукаємо дублікати.

Приклад роботи:
```text
🔍 Searching for duplicates in: ./Downloads
Calculating hashes... ████████████████████ 11/11 files

Found 2 duplicate groups (120.0 KB wasted):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group 1 (3 copies, 50.0 KB each):
  SHA-256: 3031d04fa4ca07a7794b60b8eca58afc7cc7faea73b6d47352d526e906346d02

  📄 Downloads/lecture.pdf
  📄 Downloads/lecture_copy.pdf
  📄 Downloads/backup/lecture.pdf

  Wasted space: 100.0 KB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 Total wasted space: 120.0 KB
```

### 3. `organize` — сортування файлів по категоріях

Копіює файли з вихідної папки в нову і розкладає їх по категоріях:
- `Documents` (`.pdf`, `.docx`, `.doc`, `.txt`, `.md`, `.xlsx`, `.pptx`)
- `Images` (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`)
- `Archives` (`.zip`, `.rar`, `.tar`, `.gz`, `.7z`)
- `Code` (`.js`, `.py`, `.java`, `.cpp`, `.html`, `.css`, `.json`)
- `Videos` (`.mp4`, `.avi`, `.mkv`, `.mov`, `.webm`)
- `Other` (всі інші розширення)

Оригінальні файли не видаляються. Малі файли (< 10 MB) копіюються через `fs.copyFile`, а великі (від 10 MB) — через потоки (`pipeline`). Якщо файл з таким іменем вже є у папці призначення, додається номер: `file(1).pdf`, `file(2).pdf`.

Як запустити:
```bash
node file-organizer.js organize ./Downloads --output ./Organized
```
Аргументи:
- `./Downloads` — папка, звідки беремо файли.
- `--output ./Organized` — цільова папка, куди будуть скопійовані та розсортовані файли.

Приклад роботи:
```text
📦 Organizing: ./Downloads
Target: ./Organized

Creating folders...
  ✓ Documents/
  ✓ Images/
  ✓ Archives/
  ✓ Code/
  ✓ Videos/
  ✓ Other/

Copying files... ████████████████████ 11/11

✅ Organization complete!

Summary:
  Documents:   5 files → Organized/Documents/
  Images:      2 files → Organized/Images/
  Archives:    1 files → Organized/Archives/
  Code:        1 files → Organized/Code/
  Videos:      1 files → Organized/Videos/
  Other:       1 files → Organized/Other/

Total copied: 11 files (11.2 MB)
```

### 4. `cleanup` — очищення старих файлів

Знаходить файли, які востаннє змінювалися більше ніж вказана кількість днів тому.
За замовчуванням команда працює в режимі перегляду (dry run) і нічого не видаляє, а просто показує список знайдених файлів. Щоб реально видалити їх, треба додати прапорець `--confirm`.

Як запустити:
```bash
# Тільки подивитися список (без видалення)
node file-organizer.js cleanup ./Downloads --older-than 90

# Видалити знайдені старі файли
node file-organizer.js cleanup ./Downloads --older-than 90 --confirm
```
Аргументи:
- `./Downloads` — папка для перевірки.
- `--older-than 90` — вік файлів у днях (за замовчуванням 90).
- `--confirm` — підтвердження видалення файлів.

## Структура проєкту

```text
file-organizer/
├── package.json        - налаштування проєкту та скрипти запуску
├── .gitignore          - ігноровані файли для git
├── README.md           - опис проєкту та інструкція
├── file-organizer.js   - головний файл, обробка команд і вивід у консоль
└── lib/
    ├── scanner.js      - клас Scanner для сканування директорії
    ├── duplicates.js   - клас DuplicateFinder та підрахунок SHA-256 хешів
    ├── organizer.js    - клас Organizer для копіювання і сортування файлів
    └── cleanup.js      - клас Cleanup для пошуку і видалення старих файлів
```

Всі класи в папці `lib/` наслідуються від `EventEmitter` і передають події в `file-organizer.js` для відображення прогрес-бару та результатів роботи.
