import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import express from 'express';
import cors from 'cors';
import { extractMetadata } from './metadata.js';
import { searchBooks } from './search.js';

export const SUPPORTED = ['.epub', '.pdf'];

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  return app;
}

const app = createApp();

app.get('/api/browse', (req, res) => {
  try {
    const resolved = req.query.path
      ? path.resolve(String(req.query.path).replace(/^~(?=\/|$)/, os.homedir()))
      : os.homedir();
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return res.status(400).json({ error: `Folder tidak valid: ${req.query.path}` });
    }
    const dirs = [];
    for (const e of fs.readdirSync(resolved, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      try { if (e.isDirectory()) dirs.push(e.name); } catch {}
    }
    dirs.sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
    const parent = path.dirname(resolved);
    res.json({ path: resolved, parent: parent !== resolved ? parent : null, home: os.homedir(), dirs });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function guessFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base.replace(/[_]+/g, ' ').trim();
  return cleaned;
}

const jobs = new Map();
let jobSeq = 0;
const MAX_JOBS_HISTORY = 20;
const MAX_RUNNING_JOBS = 4;

function createJob(type) {
  const id = `${type}-${++jobSeq}-${Date.now().toString(36)}`;
  const job = {
    id,
    type,
    status: 'running',
    done: 0,
    total: 0,
    current: '',
    error: null,
    result: null,
    startedAt: Date.now()
  };
  jobs.set(id, job);
  const finished = [...jobs.values()]
    .filter(j => j.status !== 'running')
    .sort((a, b) => b.startedAt - a.startedAt);
  for (const j of finished.slice(MAX_JOBS_HISTORY)) jobs.delete(j.id);
  return job;
}

function runningCount() {
  let n = 0;
  for (const j of jobs.values()) if (j.status === 'running') n++;
  return n;
}

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job tidak ditemukan (mungkin sudah dibersihkan)' });
  const { id, type, status, done, total, current, error } = job;
  res.json({ id, type, status, done, total, current, error });
});

app.get('/api/jobs/:id/result', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job tidak ditemukan' });
  if (job.status !== 'done') return res.status(409).json({ error: `Job belum selesai (status: ${job.status})` });
  res.json({ result: job.result });
});

async function runJob(job, work) {
  try {
    await work();
    job.status = 'done';
  } catch (e) {
    job.status = 'error';
    job.error = e.message;
  }
}

app.post('/api/scan', (req, res) => {
  const { path: dir } = req.body;
  try {
    if (!dir || !fs.existsSync(dir)) {
      return res.status(400).json({ error: 'Folder tidak ditemukan: ' + dir });
    }
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Bukan folder: ' + dir });
    }
    if (runningCount() >= MAX_RUNNING_JOBS) {
      return res.status(429).json({ error: 'Terlalu banyak proses berjalan, coba lagi sebentar' });
    }

    const names = fs.readdirSync(dir).filter(name => {
      try {
        const full = path.join(dir, name);
        return fs.statSync(full).isFile() && SUPPORTED.includes(path.extname(name).toLowerCase());
      } catch { return false; }
    });

    const job = createJob('scan');
    job.total = names.length;
    res.json({ jobId: job.id, total: job.total });

    runJob(job, async () => {
      const files = [];
      for (const name of names) {
        job.current = name;
        const full = path.join(dir, name);
        let meta = {};
        try {
          meta = await extractMetadata(full);
        } catch { meta = {}; }
        files.push({
          oldName: name,
          currentPath: full,
          ext: path.extname(name).toLowerCase(),
          metaTitle: meta.title,
          metaAuthor: meta.author,
          guessedTitle: meta.title || guessFromFilename(name),
          finalTitle: '',
          finalAuthor: '',
          searchCandidates: [],
          status: 'pending'
        });
        job.done++;
      }
      job.result = { dir, files };
    });
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

app.post('/api/rename', (req, res) => {
  const { dir, renames } = req.body; // renames: [{ oldName, newName }]
  try {
    if (!dir || !fs.existsSync(dir)) {
      return res.status(400).json({ error: 'Folder tidak ditemukan: ' + dir });
    }
    if (!Array.isArray(renames) || renames.length === 0) {
      return res.status(400).json({ error: 'Tidak ada rename yang dikirim' });
    }
    if (runningCount() >= MAX_RUNNING_JOBS) {
      return res.status(429).json({ error: 'Terlalu banyak proses berjalan, coba lagi sebentar' });
    }

    const job = createJob('rename');
    job.total = renames.length;
    res.json({ jobId: job.id });

    runJob(job, async () => {
      const results = [];
      for (const r of renames) {
        job.current = `${r.oldName} → ${r.newName}`;
        const oldPath = path.join(dir, r.oldName);
        const newPath = path.join(dir, r.newName);
        if (path.resolve(newPath) !== newPath || !newPath.startsWith(path.resolve(dir) + path.sep)) {
          results.push({ oldName: r.oldName, ok: false, error: 'Nama target tidak valid' });
        } else if (!fs.existsSync(oldPath)) {
          results.push({ oldName: r.oldName, ok: false, error: 'File tidak ada' });
        } else if (fs.existsSync(newPath)) {
          results.push({ oldName: r.oldName, ok: false, error: 'Nama target sudah ada: ' + r.newName });
        } else {
          try {
            fs.renameSync(oldPath, newPath);
            results.push({ oldName: r.oldName, newName: r.newName, ok: true });
          } catch (e) {
            results.push({ oldName: r.oldName, ok: false, error: e.message });
          }
        }
        job.done++;
      }
      job.result = { results };
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 4000;

process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err?.message || err);
});

export function startServer(port = PORT) {
  return new Promise((resolve) => {
    if (fs.existsSync(DIST)) app.use(express.static(DIST));
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
