import fs from 'node:fs';

const appPath = new URL('../src/App.jsx', import.meta.url);
const cssPath = new URL('../src/styles.css', import.meta.url);
const swPath = new URL('../public/sw.js', import.meta.url);

let app = fs.readFileSync(appPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

const before = `              <div className="scheduled-summary">
                <span>Dépenses programmées restantes</span>
                <strong>{formatCurrency(scheduledExpenseTotal)}</strong>
              </div>
              <div className="scheduled-summary">
                <span>Budget nourriture restant à prévoir</span>
                <strong>{formatCurrency(remainingFoodBudget)}</strong>
              </div>
              <div className="scheduled-summary">
                <span>Total restant à couvrir</span>
                <strong>{formatCurrency(totalRemainingToCover)}</strong>
              </div>
              <div className="scheduled-summary">
                <span>Disponible prévisionnel après toutes les dépenses</span>
                <strong className={availableAfterPlannedExpenses >= 0 ? 'positive' : 'negative'}>
                  {formatCurrency(availableAfterPlannedExpenses)}
                </strong>
              </div>`;

const after = `              <p className="scheduled-caption">Montants restant à prévoir jusqu’à la fin du mois</p>

              <div className="forecast-card food-forecast-card">
                <div className="forecast-icon"><ShoppingBasket size={22} /></div>
                <div className="forecast-copy">
                  <strong>Budget nourriture restant à prévoir</strong>
                  <span>Budget mensuel : {formatCurrency(FOOD_BUDGET)}</span>
                  <span>Déjà utilisé ou programmé : {formatCurrency(Math.min(totals.food + scheduledFoodTotal, FOOD_BUDGET))}</span>
                </div>
                <strong className="forecast-amount">{formatCurrency(remainingFoodBudget)}</strong>
              </div>

              <div className="forecast-card total-forecast-card">
                <div className="forecast-icon"><ListChecks size={22} /></div>
                <div className="forecast-copy">
                  <strong>Total restant à couvrir</strong>
                  <span>Dépenses programmées : {formatCurrency(scheduledExpenseTotal)}</span>
                  <span>Budget nourriture restant : {formatCurrency(remainingFoodBudget)}</span>
                </div>
                <strong className="forecast-amount">{formatCurrency(totalRemainingToCover)}</strong>
              </div>

              <div className={\`forecast-card balance-forecast-card \${availableAfterPlannedExpenses >= 0 ? 'is-positive' : 'is-negative'}\`}>
                <div className="forecast-icon"><WalletCards size={22} /></div>
                <div className="forecast-copy">
                  <strong>Solde prévisionnel fin de mois</strong>
                  <span>Disponible actuel : {formatCurrency(availableForPayments)}</span>
                  <span>{availableAfterPlannedExpenses >= 0 ? 'Excédent estimé' : 'Déficit estimé'}</span>
                </div>
                <strong className={\`forecast-amount \${availableAfterPlannedExpenses >= 0 ? 'positive' : 'negative'}\`}>
                  {formatCurrency(availableAfterPlannedExpenses)}
                </strong>
              </div>

              <details className="forecast-details">
                <summary>Détail du calcul</summary>
                <div><span>Disponible actuel</span><strong>{formatCurrency(availableForPayments)}</strong></div>
                <div><span>− Dépenses programmées</span><strong>− {formatCurrency(scheduledExpenseTotal)}</strong></div>
                <div><span>− Budget nourriture restant</span><strong>− {formatCurrency(remainingFoodBudget)}</strong></div>
                <div className="forecast-details-total">
                  <span>= Solde prévisionnel fin de mois</span>
                  <strong className={availableAfterPlannedExpenses >= 0 ? 'positive' : 'negative'}>{formatCurrency(availableAfterPlannedExpenses)}</strong>
                </div>
              </details>

              <p className="forecast-help">Les calculs tiennent uniquement compte des dépenses et budgets restant à prévoir jusqu’à la fin du mois.</p>`;

if (!app.includes(before)) {
  throw new Error('V31.5 : bloc prévisionnel V31.4 introuvable.');
}
app = app.replace(before, after);
fs.writeFileSync(appPath, app);

const marker = '/* V31.5 — lisibilité du prévisionnel */';
if (!css.includes(marker)) {
  css += `\n\n${marker}\n.scheduled-caption {\n  margin: -0.25rem 0 0.9rem;\n  color: #667481;\n  font-size: 0.92rem;\n}\n\n.forecast-card {\n  display: grid;\n  grid-template-columns: 44px minmax(0, 1fr) auto;\n  gap: 0.85rem;\n  align-items: center;\n  margin: 0.75rem 0;\n  padding: 1rem;\n  border: 1px solid #dbe4e7;\n  border-radius: 18px;\n  background: #fff;\n}\n\n.forecast-icon {\n  width: 44px;\n  height: 44px;\n  border-radius: 14px;\n  display: grid;\n  place-items: center;\n  color: #21466f;\n  background: #edf4fb;\n}\n\n.food-forecast-card .forecast-icon {\n  color: #2f7d57;\n  background: #edf8f0;\n}\n\n.forecast-copy {\n  min-width: 0;\n  display: grid;\n  gap: 0.2rem;\n}\n\n.forecast-copy > strong {\n  color: #163a5f;\n  line-height: 1.25;\n}\n\n.forecast-copy > span {\n  color: #687784;\n  font-size: 0.86rem;\n  line-height: 1.25;\n}\n\n.forecast-amount {\n  color: #163a5f;\n  white-space: nowrap;\n  font-size: 1.15rem;\n}\n\n.balance-forecast-card.is-negative {\n  border-color: #f0cccc;\n  background: #fff8f8;\n}\n\n.balance-forecast-card.is-positive {\n  border-color: #cde4d4;\n  background: #f7fcf8;\n}\n\n.forecast-details {\n  margin-top: 0.9rem;\n  padding: 0.9rem 1rem;\n  border: 1px solid #d8e3ee;\n  border-radius: 16px;\n  background: #f9fbfd;\n}\n\n.forecast-details summary {\n  cursor: pointer;\n  color: #163a5f;\n  font-weight: 800;\n}\n\n.forecast-details > div {\n  display: flex;\n  justify-content: space-between;\n  gap: 1rem;\n  padding: 0.65rem 0;\n  color: #41566a;\n  border-bottom: 1px dashed #d9e1e7;\n}\n\n.forecast-details > div:last-child {\n  border-bottom: 0;\n}\n\n.forecast-details-total {\n  margin-top: 0.25rem;\n  font-weight: 800;\n}\n\n.forecast-help {\n  margin: 0.85rem 0 0;\n  padding: 0.8rem 0.95rem;\n  border-radius: 14px;\n  background: #f0f6fb;\n  color: #52697d;\n  font-size: 0.85rem;\n  line-height: 1.35;\n}\n\n@media (max-width: 560px) {\n  .forecast-card {\n    grid-template-columns: 40px minmax(0, 1fr);\n    padding: 0.9rem;\n  }\n\n  .forecast-icon {\n    width: 40px;\n    height: 40px;\n  }\n\n  .forecast-amount {\n    grid-column: 2;\n    justify-self: start;\n    margin-top: 0.25rem;\n    font-size: 1.25rem;\n  }\n\n  .forecast-details > div {\n    align-items: flex-start;\n    font-size: 0.86rem;\n  }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE_NAME = 'mon-foyer-v[^']+';/, "const CACHE_NAME = 'mon-foyer-v31-5';");
fs.writeFileSync(swPath, sw);

console.log('V31.5 appliquée : prévisionnel simplifié, hiérarchisé et lisible sur mobile.');
