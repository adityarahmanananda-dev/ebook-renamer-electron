const OPEN_LIBRARY_URL = 'https://openlibrary.org/search.json';
const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeForCompare(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function pickBest(candidates, expectedTitle, expectedAuthor) {
  const expT = normalizeForCompare(expectedTitle);
  const expA = normalizeForCompare(expectedAuthor);
  if (!expT) return candidates[0] || null;

  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    let score = 0;
    if (expT && normalizeForCompare(c.title) === expT) score += 3;
    else if (expT && normalizeForCompare(c.title).includes(expT)) score += 2;
    else if (expT && expT.includes(normalizeForCompare(c.title))) score += 1;
    if (expA && normalizeForCompare(c.author) && expA.includes(normalizeForCompare(c.author))) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best || candidates[0] || null;
}

async function searchOpenLibrary(query, limit = 5) {
  const url = `${OPEN_LIBRARY_URL}?q=${encodeURIComponent(query)}&limit=${limit}&fields=title,author_name`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Open Library error ' + res.status);
  const data = await res.json();
  return (data.docs || []).map((d) => ({
    title: d.title || '',
    author: (d.author_name || []).join(' & '),
    source: 'Open Library',
  }));
}

async function searchGoogleBooks(query, limit = 5, apiKey = '') {
  const params = new URLSearchParams({ q: query, maxResults: String(limit) });
  if (apiKey) params.set('key', apiKey);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Google Books error ' + res.status);
  const data = await res.json();
  return (data.items || []).map((item) => {
    const v = item.volumeInfo || {};
    return {
      title: v.title || '',
      author: (v.authors || []).join(' & '),
      source: 'Google Books',
    };
  });
}

export async function searchBooks(query, expectedTitle = '', expectedAuthor = '', options = {}) {
  const limit = options.limit || 5;
  const results = [];
  const errors = [];

  try {
    const ol = await searchOpenLibrary(query, limit);
    results.push(...ol);
  } catch (e) {
    errors.push(e.message);
  }

  try {
    const gb = await searchGoogleBooks(query, limit, options.googleBooksApiKey || '');
    results.push(...gb);
  } catch (e) {
    errors.push(e.message);
  }

  const best = pickBest(results, expectedTitle, expectedAuthor);
  return {
    candidates: results,
    best,
    errors,
  };
}
