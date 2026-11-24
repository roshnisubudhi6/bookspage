# Roshni's books

A one-page reading shelf: books from my Notion **Books** database that have at least 50 words of notes, with covers. Click a cover to read the notes. Colours after Edward Hopper's *Nighthawks* (1942).

## How it works

- `index.html` — the whole site. It reads `data/books.json`.
- `data/books.json` — the books and notes. Updated by Claude from my Notion (through Claude's Notion connector, no keys), whenever I ask.
- `scripts/fetch-covers.mjs` — runs on every deploy and downloads a cover for each book (the image in my Notion page if there is one, otherwise Open Library). Books without a cover get a drawn one.
- `.github/workflows/deploy.yml` — publishes to GitHub Pages on every push to `main`.

## Updating

Ask Claude: *"update my books page from Notion"*. It reads the Books database, rewrites `data/books.json`, and pushes — the site redeploys itself.

Notes on the site keep my own thoughts, word lists and short quotes; long passages copied from books are condensed rather than reproduced.

## Custom domain

Settings → Pages → Custom domain: `books.yourdomain.com`, then add a `CNAME` record at the registrar: `books` → `roshnisubudhi6.github.io`.

## Goodreads link

In `index.html`, set the `href` of the `<a class="gr"` button to the profile URL.
