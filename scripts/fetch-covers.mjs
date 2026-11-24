// Runs in GitHub Actions at deploy time: downloads a cover for each book in
// data/books.json into covers/ and records its path. Nothing here needs a key.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const UA = { "User-Agent": "bookspage-covers (github.com/roshnisubudhi6/bookspage)" };
async function download(url, file) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: UA });
    if (!res.ok || !(res.headers.get("content-type") || "").startsWith("image/")) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return false; // Open Library's 1px "no cover" placeholder
    await writeFile(file, buf); return true;
  } catch { return false; }
}
async function openLibrary(title, author) {
  try {
    const q = new URLSearchParams({ title, limit: "5", fields: "cover_i" });
    if (author) q.set("author", author.split(/&|,| and /)[0].trim());
    const r = await (await fetch("https://openlibrary.org/search.json?" + q, { headers: UA })).json();
    const hit = (r.docs || []).find(d => d.cover_i);
    return hit ? `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg` : null;
  } catch { return null; }
}

await mkdir("covers", { recursive: true });
const books = JSON.parse(await readFile("data/books.json", "utf8"));
for (const b of books) {
  const file = `covers/${b.id}.jpg`;
  let ok = existsSync(file);
  if (!ok && b.coverUrl) ok = await download(b.coverUrl, file);
  if (!ok) { const ol = await openLibrary(b.name, b.author); if (ol) ok = await download(ol, file); }
  b.cover = ok ? file : null;
  console.log(`${ok ? "cover   " : "no cover"}  ${b.name}`);
}
await writeFile("data/books.json", JSON.stringify(books, null, 1));
