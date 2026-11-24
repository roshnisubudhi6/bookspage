# Roshni's books

A one-page reading shelf: every book from my Notion **Books** database that has at least 50 words of notes, with its cover. Click a cover to read the notes. Colours after Edward Hopper's *Nighthawks* (1942).

The site is plain HTML (`index.html`) that reads `data/books.json`. Nothing talks to Notion while people browse — the notes are copied in only when I choose to update.

## One-time setup

1. **Create a Notion integration** — go to <https://www.notion.so/profile/integrations>, click *New integration*, give it read-only content access, and copy the secret (`ntn_…` or `secret_…`).
2. **Share the Books database with it** — open the Books database in Notion → `•••` → *Connections* → add the integration.
3. **Store the secret in this repo** — GitHub → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*, name `NOTION_TOKEN`.
4. **Turn on Pages** — *Settings* → *Pages* → *Source*: **GitHub Actions**.
5. **Custom domain (optional)** — *Settings* → *Pages* → *Custom domain*: `books.yourdomain.com`, then at your domain registrar add a `CNAME` record: `books` → `roshnisubudhi6.github.io`. Tick *Enforce HTTPS* once it appears.

## Updating the shelf (whenever I want)

GitHub → *Actions* → **Deploy books page** → *Run workflow*. It pulls the latest books and notes from Notion, commits them under my name, and redeploys.

Or locally:

```bash
NOTION_TOKEN=ntn_xxx npm run sync   # writes data/books.json and covers/
npm run serve                       # preview at http://localhost:3000
git add data covers && git commit -m "Update books" && git push
```

## What the sync does

- Skips books whose notes are under 50 words (change with `MIN_WORDS=…`).
- Drops images, embeds and file blocks from the notes; keeps text, headings, lists, quotes, callouts, tables and highlights.
- Cover: the first image in the Notion page if there is one, otherwise Open Library. Books with no cover found get a drawn one in the site's palette. Covers are cached in `covers/` — delete a file to fetch it again.

Notes are published exactly as written in Notion, so check that anything long quoted from a book is something you're happy to make public.

## Change the Goodreads link

In `index.html`, find the `<a class="gr"` button and set its `href` to your profile URL.
