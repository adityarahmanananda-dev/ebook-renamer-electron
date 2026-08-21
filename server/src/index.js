import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import express from 'express';
import cors from 'cors';
import { extractMetadata } from './metadata.js';
import { searchBooks } from './search.js';

export const SUPPORTED = ['.epub', '.pdf'];

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  return app;
}

const app = createApp();

function guessFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base.replace(/[_]+/g, ' ').trim();
  return cleaned;
}

app.post('/api/scan', async (req, res) => {
  const { path: dir } = req.body;
  try {
    if (!dir || !fs.existsSync(dir)) {
      return res.status(400).json({ error: 'Folder tidak ditemukan: ' + dir });
    }
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Bukan folder: ' + dir });
    }

    const files = [];
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile()) continue;
      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED.includes(ext)) continue;

      const meta = await extractMetadata(full);
      files.push({
        oldName: name,
        currentPath: full,
        ext,
        metaTitle: meta.title,
        metaAuthor: meta.author,
        guessedTitle: meta.title || guessFromFilename(name),
        finalTitle: '',
        finalAuthor: '',
        searchCandidates: [],
        status: 'pending',
      });
    }

    return res.json({ dir, files });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/search', async (req, res) => {
  const { query, expectedTitle, expectedAuthor } = req.body;
  try {
    const result = await searchBooks(query, expectedTitle, expectedAuthor, {
      googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY || '',
    });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

function sanitizeName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTargetName(title, author, ext) {
  const t = sanitizeName(title) || 'unknown';
  const a = sanitizeName(author);
  const fileName = a ? `${t}-${a}` : t;
  return fileName + ext;
}

app.post('/api/rename', async (req, res) => {
  const { dir, renames } = req.body; // renames: [{ oldName, newName }]
  try {
    const results = [];
    for (const r of renames || []) {
      const oldPath = path.join(dir, r.oldName);
      const newPath = path.join(dir, r.newName);
      if (!fs.existsSync(oldPath)) {
        results.push({ oldName: r.oldName, ok: false, error: 'File tidak ada' });
        continue;
      }
      if (fs.existsSync(newPath)) {
        results.push({ oldName: r.oldName, ok: false, error: 'Nama target sudah ada: ' + r.newName });
        continue;
      }
      try {
        fs.renameSync(oldPath, newPath);
        results.push({ oldName: r.oldName, newName: r.newName, ok: true });
      } catch (e) {
        results.push({ oldName: r.oldName, ok: false, error: e.message });
      }
    }
    return res.json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 4000;

export function startServer(port = PORT) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Server jalan di http://localhost:${port}`);
      resolve(server);
    });
  });
}

export function isMain() {
  return (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  );
}

if (isMain()) {
  startServer();
}

export { app, buildTargetName };
