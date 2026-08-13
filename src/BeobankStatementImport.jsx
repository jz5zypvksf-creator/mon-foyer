import { useEffect, useMemo, useState } from 'react';
import { FileUp, Landmark, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorker;

const EXPECTED_ACCOUNT = 'BE53953130570453';
const META_KEY = 'mon-foyer-beobank-last-statement-v1';

function parseEuro(raw) {
  return Number(String(raw || '').replace(/\./g, '').replace(',', '.')) || 0;
}

function normalizeAccount(raw) {
  return String(raw || '').replace(/\s/g, '').toUpperCase();
}

function parseStatementText(text) {
  const compact = String(text || '').replace(/\s+/g, ' ');
  const accountMatch = compact.match(/BE53\s*9531\s*3057\s*0453/i);
  const closingMatch = compact.match(/(\d{2}\/\d{2}\/\d{4})\s+SOLDE\s+DE\s+FIN\s+([\d.]+,\d{2})/i);
  if (!accountMatch) throw new Error("Ce PDF ne correspond pas au compte Beobank attendu BE53 9531 3057 0453.");
  if (!closingMatch) throw new Error("Le solde de fin n'a pas pu être identifié dans cet extrait Beobank.");
  return {
    account: normalizeAccount(accountMatch[0]),
    date: closingMatch[1],
    balance: parseEuro(closingMatch[2]),
  };
}

export default function BeobankStatementImport({ currentBalance = 0, onApply }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastMeta, setLastMeta] = useState(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(META_KEY) || 'null');
      if (stored) setLastMeta(stored);
    } catch { /* rien */ }
  }, []);

  const delta = useMemo(() => result ? result.balance - Number(currentBalance || 0) : 0, [result, currentBalance]);

  const readPdf = async (file) => {
    if (!file) return;
    setBusy(true);
    setStatus('Lecture de l’extrait Beobank…');
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocument({ data: bytes }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => item.str).join(' '));
      }
      const parsed = parseStatementText(pages.join(' '));
      if (parsed.account !== EXPECTED_ACCOUNT) throw new Error('Le numéro de compte Beobank ne correspond pas au compte Vacances/Loisirs configuré.');
      setResult({ ...parsed, fileName: file.name });
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
    setStatus(`Solde Beobank du ${result.date} appliqué : ${result.balance.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' })}.`);
  };

  return (
    <div className="beobank-import">
      <div className="beobank-import-head">
        <Landmark size={18} />
        <div>
          <strong>Contrôle Beobank — Vacances/Loisirs</strong>
          <small>Le PDF est lu localement. Seuls le compte, la date et le solde final sont utilisés.</small>
        </div>
      </div>

      <label className="beobank-upload-button">
        <FileUp size={17} />
        <span>{busy ? 'Lecture en cours…' : 'Importer un extrait Beobank'}</span>
        <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => readPdf(event.target.files?.[0])} />
      </label>

      {result && (
        <div className="beobank-result">
          <div><span>Compte reconnu</span><strong>BE53 9531 3057 0453</strong></div>
          <div><span>Solde de fin au {result.date}</span><strong>{result.balance.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' })}</strong></div>
          <div><span>Solde Mon Foyer actuel</span><strong>{Number(currentBalance || 0).toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' })}</strong></div>
          <div><span>Écart</span><strong>{delta.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' })}</strong></div>
          <button type="button" className="beobank-apply" onClick={apply}><CheckCircle2 size={17} /> Mettre à jour Vacances/Loisirs</button>
        </div>
      )}

      {status && <p className="beobank-status"><AlertTriangle size={14} /> {status}</p>}
      {lastMeta && !result && <small className="beobank-last">Dernier contrôle : {lastMeta.date} · {Number(lastMeta.balance || 0).toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' })}</small>}
    </div>
  );
}
