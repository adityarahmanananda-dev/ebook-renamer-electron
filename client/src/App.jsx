import { useState } from 'react';

function FileRow({ file, index, onUpdate }) {
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [candidates, setCandidates] = useState(file.searchCandidates || []);

  const finalName = (file.finalTitle || file.guessedTitle || '') +
    (file.finalAuthor ? '-' + file.finalAuthor : '') + file.ext;

  const runSearch = async () => {
    setSearching(true);
    setSearchError('');
    try {
      const query = file.guessedTitle || file.oldName;
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          expectedTitle: file.finalTitle || file.metaTitle,
          expectedAuthor: file.finalAuthor || file.metaAuthor,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal search');
      setCandidates(data.candidates || []);
      if (data.best) {
        onUpdate({
          finalTitle: data.best.title,
          finalAuthor: data.best.author,
          status: 'ok',
        });
      }
    } catch (e) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const pickCandidate = (title, author) => {
    setCandidates((prev) => prev);
    onUpdate({ finalTitle: title, finalAuthor: author, status: 'ok' });
  };

  return (
    <tr>
      <td style={{ width: '30%' }}>
        <div className="file-old">{file.oldName}</div>
        <div className="field-label" style={{ marginTop: 6 }}>
          Deteksi dari file: {file.metaTitle ? file.metaTitle + (file.metaAuthor ? ' — ' + file.metaAuthor : '') : '—'}
        </div>
      </td>
      <td style={{ width: '40%' }}>
        <div className="field-label">Judul</div>
        <input
          className="small"
          value={file.finalTitle || ''}
          placeholder={file.guessedTitle || 'Judul'}
          onChange={(e) => onUpdate({ finalTitle: e.target.value })}
        />
        <div className="field-label" style={{ marginTop: 6 }}>Penulis</div>
        <input
          className="small"
          value={file.finalAuthor || ''}
          placeholder="Nama penulis"
          onChange={(e) => onUpdate({ finalAuthor: e.target.value })}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="secondary" disabled={searching} onClick={runSearch}>
            {searching ? 'Mencari…' : 'Cari otomatis'}
          </button>
          {candidates.length > 0 && (
            <select
              className="small"
              defaultValue=""
              onChange={(e) => {
                const idx = e.target.value;
                if (idx === '') return;
                const c = candidates[idx];
                pickCandidate(c.title, c.author);
              }}
            >
              <option value="">Pilih hasil…</option>
              {candidates.map((c, i) => (
                <option key={i} value={i}>
                  {c.title} — {c.author || '?'} ({c.source})
                </option>
              ))}
            </select>
          )}
        </div>
        {searchError && <div className="error" style={{ marginTop: 6 }}>{searchError}</div>}
      </td>
      <td style={{ width: '18%' }}>
        <div className="field-label">Akan menjadi</div>
        <div className="file-new">{finalName}</div>
      </td>
      <td style={{ width: '12%' }}>
        <span className={`status-badge status-${file.status}`}>{file.status}</span>
      </td>
    </tr>
  );
}

export default function App() {
  const [dir, setDir] = useState('');
  const [scanning, setScanning] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [renamed, setRenamed] = useState([]);

  const pickFolder = async () => {
    try {
      const picked = await window.electronAPI.pickFolder();
      if (picked) setDir(picked);
    } catch (e) {
      setError(e.message);
    }
  };

  const scan = async () => {
    setScanning(true);
    setError('');
    setRenamed([]);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dir }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal scan');
      setFiles(data.files || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const updateFile = (index, patch) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const applyRenames = async () => {
    setRenaming(true);
    setError('');
    const renames = files.map((f) => {
      const finalName = (f.finalTitle || f.guessedTitle || '') +
        (f.finalAuthor ? '-' + f.finalAuthor : '') + f.ext;
      return { oldName: f.oldName, newName: finalName };
    });
    try {
      const res = await fetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir, renames }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal rename');
      setRenamed(data.results || []);
      const byOld = {};
      (data.results || []).forEach((r) => {
        byOld[r.oldName] = r.ok ? 'ok' : 'error';
      });
      setFiles((prev) =>
        prev.map((f) => ({ ...f, status: byOld[f.oldName] || f.status }))
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="app">
      <h1>📚 Ebook Renamer</h1>
      <div className="card">
        <div className="row">
          {window.electronAPI ? (
            <button className="secondary" onClick={pickFolder} style={{ minWidth: 140 }}>
              📁 Pilih Folder…
            </button>
          ) : null}
          <input
            type="text"
            value={dir}
            placeholder="Path folder yang mau discan, contoh: /home/user/Buku"
            onChange={(e) => setDir(e.target.value)}
          />
          <button disabled={!dir || scanning} onClick={scan}>
            {scanning ? 'Scanning…' : 'Scan Folder'}
          </button>
        </div>
        <div style={{ fontSize: 0.82, color: '#94a3b8', marginTop: 8 }}>
          {window.electronAPI
            ? 'Klik "Pilih Folder" untuk memilih folder lewat dialog, atau ketik path manual.'
            : 'Scan file .epub dan .pdf. Setelah itu klik "Cari otomatis" per file untuk melengkapi judul & penulis, atau isi manual.'}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {files.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{files.length} file ditemukan</strong>
            <div className="row">
              <button
                className="success"
                disabled={renaming || files.length === 0}
                onClick={applyRenames}
              >
                {renaming ? 'Merename…' : 'Terapkan Semua Rename'}
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>File asli</th>
                <th>Judul & Penulis</th>
                <th>Hasil</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <FileRow
                  key={i}
                  file={f}
                  index={i}
                  onUpdate={(patch) => updateFile(i, patch)}
                />
              ))}
            </tbody>
          </table>
          {renamed.length > 0 && (
            <div className="summary">
              <strong>Hasil rename:</strong>
              <ul>
                {renamed.map((r, i) => (
                  <li key={i}>
                    {r.ok
                      ? `✅ ${r.oldName} → ${r.newName}`
                      : `❌ ${r.oldName}: ${r.error}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
