# RARE

**Read And Remember Everything** — a personal knowledge system that turns your saved URLs, PDFs, and notes into a self-organizing wiki you can chat with.

Paste a link or drop a PDF. Claude reads it, extracts entities and concepts, and writes structured wiki pages. Ask questions in the chat and get cited answers grounded in what you've actually saved — not hallucinations.

The wiki is plain markdown on disk and doubles as an [Obsidian](https://obsidian.md) vault.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Docker Compose on Linux)
- An [Anthropic API key](https://console.anthropic.com/) (requires a paid account)

That's it. No Node.js, no Python, no database setup.

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/sytang9/rare.git
cd rare
```

### 2. Set your API key

Create a `.env` file in the project root:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env
```

Replace `sk-ant-your-key-here` with your actual key from [console.anthropic.com](https://console.anthropic.com/).

### 3. Start RARE

```bash
docker compose up --build
```

The first run takes ~2 minutes to build. Subsequent starts are instant.

Once you see `RARE server on http://localhost:3100`, open **http://localhost:3100** in your browser.

To stop: press `Ctrl+C`, or run `docker compose down` in another terminal.

---

## Usage

### Ingest tab — add sources

| Source type | How to add |
|---|---|
| Website / article | Paste the URL and click **Ingest** |
| PDF (text extraction) | Drop the PDF file onto the upload area |
| PDF (vision mode) | Drop the PDF and enable **Vision PDF** toggle for scanned/image PDFs |
| Plain text / notes | Paste markdown or text directly |

After ingesting, RARE queues the source and processes it in the background. A spinner shows progress. When done, the source appears in the **Sources** tab and new wiki pages appear in **Wiki** and **Graph**.

### Chat tab — ask questions

Type any question about your saved content. Answers are grounded in your wiki pages with sources listed at the bottom.

- Use the **Haiku / Sonnet / Opus** pill to choose the model (Sonnet is the default and best for most questions)
- Toggle **THINK** for harder reasoning questions (Sonnet and Opus only)
- **New Chat** button starts a fresh conversation
- Past conversations appear in the left sidebar — click to resume, trash icon to delete

### Wiki tab — browse pages

Browse all generated pages grouped by type (Concepts, Entities, Sources). Click a page to read it. Click source badges to see the original ingested text.

### Graph tab — explore connections

Force-directed graph of all wiki pages and their wikilink connections. Use the search box (top-left) to find and zoom to any node. Click a node to see its neighbours.

### Settings tab

- Set your cost ceiling (RARE stops ingesting if monthly spend exceeds this)
- View month-to-date API spend broken down by operation type
- Adjust the lint interval

---

## Your data (the vault)

All wiki content is stored as plain markdown in a `vault/` folder next to your `docker-compose.yml`. Nothing is sent anywhere except the Anthropic API.

```
vault/
├── purpose.md          ← edit this to tell RARE what your vault is for
├── schema.md           ← edit this to tune how pages are structured
├── raw/sources/        ← original ingested content (never modified)
└── wiki/               ← generated pages (concepts, entities, sources, lint reports)
```

**Open `vault/` in Obsidian** to get a graph view and edit pages freely. RARE and Obsidian can be open at the same time.

To keep your vault across rebuilds, the `vault/` folder lives on your host machine — not inside Docker. You can also set a custom location:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
VAULT_PATH=/Users/you/Documents/my-vault
```

---

## Updating

```bash
git pull
docker compose up --build
```

Your vault is unaffected — it lives outside the container.

---

## Stack

React 19 + TypeScript + Vite frontend, Express backend, SQLite for queue and chat history, `@anthropic-ai/sdk` for Claude (Haiku for ingest/lint, Sonnet/Opus for chat). All served from a single Docker container.

## License

TBD pending v1 release.
