import { useEffect, useMemo, useState } from 'react';
import { FileUp, Landmark, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatMoney, parseMoney } from './domain/money/money.js';

const EXPECTED_ACCOUNT = 'BE53953130570453';
const META_KEY = 'mon-foyer-beobank-last-statement-v1';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

function parseStatementText(text) {
  const compact = String(text || '').replace(/\s+/g, ' ');
  const accountMatch = compact.match(/BE53\s*9531\s*3057\s*0453/i);
  const closingMatch = compact.match(/(\d{2}\/\d{2}\/\d{4})\s+SOLDE\s+DE\s+FIN\s+([\d.]+,\d{2})/i);
  if (!accountMatch) throw new Error('Ce PDF ne correspond pas au compte Beobank attendu BE53 9531 3057 0453.');
  if (!closingMatch) throw new Error("Le solde de fin n'a pas pu être identifié dans cet extrait Beobank.");
  return { date: closingMatch[1], balance: parseMoney(closingMatch[2]) };
}

export default function BeobankStatementImport({ currentBalance = 0, onApply }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastMeta, setLastMeta] = useState(null);

  useEffect(() => {
    try { setLastMeta(JSON.parse(localStorage.getItem(META_KEY) || 'null')); } catch { /* rien */ }
  }, []);

  const delta = useMemo(() => result ? result.balance - Number(currentBalance || 0) : 0, [result, currentBalance]);

  const readPdf = async (file) => {
    if (!file) return;
    setBusy(true);
    setStatus('Lecture de l’extrait Beobank…');
    setResult(null);
    try {
      const pdfjs = await import(/* @vite-ignore */ PDFJS_URL);
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => item.str).join(' '));
      }
      const parsed = parseStatementText(pages.join(' '));
      setResult({ ...parsed, account: EXPECTED_ACCOUNT, fileName: file.name });
      setStatus('Extrait reconnu. Vérifie le solde avant de confirmer la mise à jour.');
    } catch (error) {
      setStatus(error?.message || "Impossible de lire cet extrait Beobank.");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!result || typeof onApply !== 'function') return;
    onApply(result.balance);
    const meta = { ...result, importedAt: new Date().toISOString() };
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    setLastMeta(meta);
    setStatus(`Solde Beobank du ${result.date} appliqué : ${formatMoney(result.balance)}.`);
  };

  return (
    <div className="beobank-import">
      <div className="beobank-import-head">
        <Landmark size={18} />
        <div><strong>Contrôle Beobank — Vacances/Loisirs</strong><small>Lecture locale du PDF : compte, date et solde final uniquement.</small></div>
      </div>
      <label className="beobank-upload-button">
        <FileUp size={17} /><span>{busy ? 'Lecture en cours…' : 'Importer un extrait Beobank'}</span>
        <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => readPdf(event.target.files?.[0])} />
      </label>
      {result && (
        <div className="beobank-result">
          <div><span>Compte reconnu</span><strong>BE53 9531 3057 0453</strong></div>
          <div><span>Solde de fin au {result.date}</span><strong>{formatMoney(result.balance)}</strong></div>
          <div><span>Solde Mon Foyer actuel</span><strong>{formatMoney(currentBalance)}</strong></div>
          <div><span>Écart</span><strong>{formatMoney(delta)}</strong></div>
          <button type="button" className="beobank-apply" onClick={apply}><CheckCircle2 size={17} /> Mettre à jour Vacances/Loisirs</button>
        </div>
      )}
      {status && <p className="beobank-status"><AlertTriangle size={14} /> {status}</p>}
      {lastMeta && !result && <small className="beobank-last">Dernier contrôle : {lastMeta.date} · {formatMoney(lastMeta.balance)}</small>}
    </div>
  );
}
