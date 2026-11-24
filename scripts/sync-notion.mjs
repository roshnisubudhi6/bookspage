// Pulls the Books database from Notion and writes data/books.json + covers/.
// Usage: NOTION_TOKEN=secret_xxx node scripts/sync-notion.mjs
// Optional: NOTION_DATABASE_ID (defaults to the Books database), MIN_WORDS (default 50).
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const TOKEN = process.env.NOTION_TOKEN;
const DB = (process.env.NOTION_DATABASE_ID || "3a084bef93784f89ade667b2700e4224").replace(/-/g, "");
const MIN_WORDS = Number(process.env.MIN_WORDS || 50);
if (!TOKEN) { console.error("Set NOTION_TOKEN first (see README)."); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function notion(path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://api.notion.com/v1/" + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * (attempt + 1)); continue; }
    const json = await res.json();
    if (!res.ok) throw new Error(`Notion ${res.status} on ${path}: ${json.message || ""}`);
    return json;
  }
  throw new Error("Notion kept refusing " + path);
}

/* ---------- properties ---------- */
const plain = arr => (arr || []).map(t => t.plain_text).join("").trim();
function prop(page, name) {
  const p = page.properties[name];
  if (!p) return "";
  switch (p.type) {
    case "title": return plain(p.title);
    case "rich_text": return plain(p.rich_text);
    case "select": return p.select?.name || "";
    case "status": return p.status?.name || "";
    case "multi_select": return p.multi_select.map(o => o.name);
    case "url": return p.url || "";
    default: return "";
  }
}

/* ---------- blocks → HTML ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function rich(arr) {
  return (arr || []).map(t => {
    let s = esc(t.plain_text).replace(/\n/g, "<br>");
    const a = t.annotations || {};
    if (a.code) s = `<code>${s}</code>`;
    if (a.bold) s = `<b>${s}</b>`;
    if (a.italic) s = `<i>${s}</i>`;
    if (a.strikethrough) s = `<s>${s}</s>`;
    if (a.color && a.color.endsWith("_background")) s = `<mark>${s}</mark>`;
    const href = t.href || t.text?.link?.url;
    if (href && /^https:\/\//.test(href)) s = `<a href="${esc(href)}" target="_blank" rel="noopener">${s}</a>`;
    return s;
  }).join("");
}
async function children(id) {
  const out = []; let cursor;
  do {
    const r = await notion(`blocks/${id}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`);
    out.push(...r.results); cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  for (const b of out) if (b.has_children && !["child_page", "child_database"].includes(b.type)) b._kids = await children(b.id);
  return out;
}
const SKIP = new Set(["image", "video", "audio", "file", "pdf", "embed", "bookmark", "link_preview", "child_page", "child_database", "unsupported", "breadcrumb", "table_of_contents"]);
let firstImage = null;
async function blocksToHTML(blocks) {
  const html = []; let list = null;
  const close = () => { if (list) { html.push(`</${list}>`); list = null; } };
  for (const b of blocks) {
    const d = b[b.type] || {};
    if (b.type === "image" && !firstImage) firstImage = d.type === "external" ? d.external?.url : d.file?.url;
    if (SKIP.has(b.type)) continue;
    const kids = b._kids ? await blocksToHTML(b._kids) : "";
    const li = b.type === "bulleted_list_item" ? "ul" : b.type === "numbered_list_item" ? "ol" : null;
    if (li) {
      if (list !== li) { close(); html.push(`<${li}>`); list = li; }
      const t = rich(d.rich_text);
      if (t.trim() || kids) html.push(`<li>${t}${kids}</li>`);
      continue;
    }
    close();
    const t = rich(d.rich_text);
    switch (b.type) {
      case "paragraph": if (t.replace(/<br>|→|\s/g, "")) html.push(`<p>${t}</p>`); if (kids) html.push(kids); break;
      case "heading_1": case "heading_2": if (t) html.push(`<h3>${t}</h3>`); if (kids) html.push(kids); break;
      case "heading_3": if (t) html.push(`<h4>${t}</h4>`); if (kids) html.push(kids); break;
      case "quote": html.push(`<blockquote>${t}${kids}</blockquote>`); break;
      case "callout": html.push(`<div class="callout">${t}${kids}</div>`); break;
      case "toggle": html.push(`<p><b>${t}</b></p>${kids}`); break;
      case "to_do": html.push(`<p>${d.checked ? "☑" : "☐"} ${t}</p>`); break;
      case "code": html.push(`<pre><code>${t}</code></pre>`); break;
      case "divider": html.push("<hr>"); break;
      case "column_list": case "column": case "synced_block": if (kids) html.push(kids); break;
      case "table": {
        const rows = (b._kids || []).filter(r => r.type === "table_row");
        html.push("<table>" + rows.map(r => "<tr>" + r.table_row.cells.map(c => `<td>${rich(c)}</td>`).join("") + "</tr>").join("") + "</table>");
        break;
      }
      default: if (t) html.push(`<p>${t}</p>`);
    }
  }
  close();
  return html.join("\n");
}
const words = html => (html.replace(/<[^>]+>/g, " ").match(/[\p{L}\p{N}'’-]+/gu) || []).length;

/* ---------- covers ---------- */
async function download(url, file) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "bookspage-sync" } });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return false; // Open Library returns a 1px placeholder for misses
    await writeFile(file, buf); return true;
  } catch { return false; }
}
async function openLibraryCover(title, author) {
  try {
    const q = new URLSearchParams({ title, limit: "5", fields: "cover_i,title" });
    if (author) q.set("author", author.split(/&|,| and /)[0].trim());
    const r = await (await fetch("https://openlibrary.org/search.json?" + q, { headers: { "User-Agent": "bookspage-sync" } })).json();
    const hit = (r.docs || []).find(d => d.cover_i);
    return hit ? `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg` : null;
  } catch { return null; }
}

/* ---------- run ---------- */
await mkdir("data", { recursive: true });
await mkdir("covers", { recursive: true });
const pages = []; let cursor;
do {
  const r = await notion(`databases/${DB}/query`, { page_size: 100, start_cursor: cursor, sorts: [{ timestamp: "created_time", direction: "descending" }] });
  pages.push(...r.results); cursor = r.has_more ? r.next_cursor : undefined;
} while (cursor);

const books = []; const keep = new Set();
for (const page of pages) {
  const id = page.id.replace(/-/g, "");
  const name = prop(page, "Name") || "Untitled";
  const author = prop(page, "Author");
  firstImage = null;
  const notes = await blocksToHTML(await children(page.id));
  const n = words(notes);
  if (n < MIN_WORDS) { console.log(`skip  ${name} (${n} words)`); continue; }
  const file = `covers/${id}.jpg`;
  let cover = existsSync(file) ? file : null;
  if (!cover && firstImage && await download(firstImage, file)) cover = file;
  if (!cover) { const ol = await openLibraryCover(name, author); if (ol && await download(ol, file)) cover = file; }
  if (cover) keep.add(`${id}.jpg`);
  books.push({ id, name, author, kind: prop(page, "It's a/an"), tags: prop(page, "Tags") || [], cover, notes });
  console.log(`keep  ${name} (${n} words${cover ? ", cover" : ", no cover"})`);
}
for (const f of await readdir("covers")) if (f.endsWith(".jpg") && !keep.has(f)) await unlink(`covers/${f}`);
await writeFile("data/books.json", JSON.stringify(books, null, 1));
console.log(`\n${books.length} books written to data/books.json`);
