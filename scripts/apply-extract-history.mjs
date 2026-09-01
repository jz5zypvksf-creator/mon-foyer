import fs from 'node:fs';

const path = 'src/App.jsx';
let source = fs.readFileSync(path, 'utf8');

const importNeedle = "import DuplicateAudit from './DuplicateAudit.jsx';";
const importLine = "import OperationHistory from './features/operations/OperationHistory.jsx';";
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error('DuplicateAudit import anchor not found');
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const historyStart = "        {activeView === 'history' && (";
const messagesStart = "        {activeView === 'messages' && (";
const startIndex = source.indexOf(historyStart);
const endIndex = source.indexOf(messagesStart, startIndex);
if (startIndex < 0 || endIndex < 0) throw new Error('History JSX block anchors not found');

const replacement = `        {activeView === 'history' && (\n          <OperationHistory\n            operations={data.operations}\n            monthOperations={monthOperations}\n            filteredMonthOperations={filteredMonthOperations}\n            categories={data.categories}\n            selectedMonth={selectedMonth}\n            historySearch={historySearch}\n            setHistorySearch={setHistorySearch}\n            historyType={historyType}\n            setHistoryType={setHistoryType}\n            historyPerson={historyPerson}\n            setHistoryPerson={setHistoryPerson}\n            historyPeople={historyPeople}\n            historyCategory={historyCategory}\n            setHistoryCategory={setHistoryCategory}\n            historyPaymentMethod={historyPaymentMethod}\n            setHistoryPaymentMethod={setHistoryPaymentMethod}\n            showReviewOnly={showReviewOnly}\n            setShowReviewOnly={setShowReviewOnly}\n            reviewMap={reviewMap}\n            historyTotals={historyTotals}\n            paymentBalances={paymentBalances}\n            today={today}\n            onEditOperation={editOperation}\n            onDeleteOperation={deleteOperation}\n            DuplicateAuditComponent={DuplicateAudit}\n          />\n        )}\n\n`;
source = source.slice(0, startIndex) + replacement + source.slice(endIndex);

const rowStart = source.indexOf('function OperationRow(');
const navStart = source.indexOf('function NavButton(', rowStart);
if (rowStart < 0 || navStart < 0) throw new Error('OperationRow cleanup anchors not found');
source = source.slice(0, rowStart) + source.slice(navStart);

if (source.includes("{activeView === 'history' && (\n          <section className=\"view\">")) {
  throw new Error('Legacy history JSX still present');
}
if (source.includes('function OperationRow(')) {
  throw new Error('Legacy OperationRow still present');
}
if (!source.includes('<OperationHistory')) {
  throw new Error('OperationHistory wiring missing');
}

fs.writeFileSync(path, source);
console.log('OperationHistory wired into App.jsx and legacy history code removed.');
