import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

function clean(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function extractEpubMetadata(filePath) {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    let containerXml = entries.find(
      (e) => e.entryName.replace(/^\/+/, '') === 'META-INF/container.xml'
    );
    if (!containerXml) return { title: '', author: '' };

    const container = containerXml.getData().toString('utf8');
    const rootfileMatch = container.match(
      /<rootfile[^>]*full-path=["']([^"']+)["']/i
    );
    if (!rootfileMatch) return { title: '', author: '' };

    const opfPath = rootfileMatch[1];
    const opfEntry = entries.find(
      (e) => e.entryName.replace(/^\/+/, '') === opfPath.replace(/^\/+/, '')
    );
    if (!opfEntry) return { title: '', author: '' };

    const opf = opfEntry.getData().toString('utf8');

    const titleMatch = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
    const title = titleMatch ? clean(titleMatch[1]) : '';

    const creatorMatches = opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/gi) || [];
    const authors = creatorMatches
      .map((m) => m.replace(/<\/?dc:creator[^>]*>/gi, ''))
      .map((m) => clean(m))
      .filter(Boolean);

    return { title, author: authors.join(' & ') };
  } catch (e) {
    return { title: '', author: '' };
  }
}

export function extractPdfMetadata(filePath) {
  return new Promise((resolve) => {
    import('pdf-parse')
      .then(async ({ default: pdfParse }) => {
        const data = await pdfParse(filePath);
        const info = data.info || {};
        resolve({ title: clean(info.Title), author: clean(info.Author) });
      })
      .catch(() => resolve({ title: '', author: '' }));
  });
}

export async function extractMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.epub') return extractEpubMetadata(filePath);
  if (ext === '.pdf') return await extractPdfMetadata(filePath);
  return { title: '', author: '' };
}
