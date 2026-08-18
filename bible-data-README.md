# Bible text data

Drop this `bible/` folder next to your `index.html` on GitHub Pages.

## Layout
```
bible/kjv/index.json     ~10 KB   book list, chapter/verse counts, aliases
bible/kjv/gen.json       ~196 KB
bible/kjv/psa.json       ~224 KB   (largest)
bible/kjv/3jn.json       ~1.6 KB   (smallest)
...66 books
bible/web/...            same shape
```

## Book file shape
```json
{"id":"rom","name":"Romans","ch":[["Paul, a servant...", "..."], ...]}
```
`ch[c-1][v-1]` is the verse text. Chapter and verse are 1-indexed in
references, 0-indexed in the arrays.

## index.json shape
```json
{"translation":"kjv","title":"King James Version (1769)",
 "license":"Public domain","totalVerses":31102,
 "omitted":[["luk",17,36], ...],
 "books":[{"id":"rom","name":"Romans","abbr":"Rom","ot":false,
           "chapters":16,"verses":[32,29,...],"aliases":["romans","ro","rm"]}]}
```

- `verses[]` — verse count per chapter. Lets you validate a reference and
  build the reader's chapter/verse pickers WITHOUT fetching the book.
- `aliases[]` — for the reference parser ("Rom", "romans", "rm" -> `rom`).
- `omitted[]` — verse slots that exist in the numbering but have no text in
  this translation. KJV: none. WEB: Luke 17:36, Acts 8:37, 15:34, 24:7
  (textual variants absent from the critical text). Render these as
  "— not in this translation" rather than a blank line.

## IDs
Standard USFM three-letter codes, lowercased: `gen exo lev ... jud rev`.
Both translations use identical ids and identical chapter counts, so a card's
reference pointers stay valid across a translation switch.

## Loading
Fetch `index.json` once at boot (10 KB). Fetch book files on demand and hold
them in an in-memory `Map`. Never write verse text to localStorage — the
5 MB budget is for user data only.
