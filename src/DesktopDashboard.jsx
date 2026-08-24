import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Info,
  LineChart,
  ReceiptText,
} from 'lucide-react';
import './DesktopDashboard.css';

const money = (value) => new Intl.NumberFormat('fr-BE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
}).format(Number(value) || 0);

const shortMoney = (value) => new Intl.NumberFormat('fr-BE', {
  style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1,
}).format(Number(value) || 0);

const monthLabel = (month) => new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })
  .format(new Date(`${month}-01T12:00:00`));

function chartGeometry(series) {
  const width = 760;
  const height = 280;
  const padding = { top: 24, right: 22, bottom: 36, left: 64 };
  const values = series.flatMap((row) => [row.available, row.cumulativeExpenses, 0]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const x = (index) => padding.left + (index / Math.max(series.length - 1, 1)) * (width - padding.left - padding.right);
  const y = (value) => padding.top + ((maximum - value) / range) * (height - padding.top - padding.bottom);
  const points = (field) => series.map((row, index) => `${x(index)},${y(row[field])}`).join(' ');
  return { width, height, padding, minimum, maximum, x, y, points };
}

function StatusIcon({ status }) {
  if (status === 'done') return <CheckCircle2 size={18} />;
  if (status === 'warning') return <AlertTriangle size={18} />;
  return <Info size={18} />;
}

export default function DesktopDashboard({
  series = [], categories = [], checks = [], selectedMonth,
  forecastBalance = 0, scheduledTotal = 0,
  onDaySelect, onCategorySelect, onCheckSelect,
}) {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const geometry = useMemo(() => chartGeometry(series), [series]);
  const expenseCategories = useMemo(() => categories
    .filter((category) => category.total > 0 && category.type !== 'income')
    .sort((left, right) => right.total - left.total)
    .slice(0, 8), [categories]);
  const maxCategory = expenseCategories[0]?.total || 1;
  const chartTicks = [geometry.maximum, (geometry.maximum + geometry.minimum) / 2, geometry.minimum];

  const selectPoint = (row) => {
    setSelectedPoint(row);
    onDaySelect?.(row.date);
  };

  return (
    <section className="desktop-dashboard" aria-label="Tableau de bord ordinateur">
      <div className="desktop-dashboard-heading">
        <div>
          <span className="desktop-only-label">Vue ordinateur</span>
          <h2>Tableau de bord de {monthLabel(selectedMonth)}</h2>
        </div>
        <div className={forecastBalance >= 0 ? 'desktop-forecast positive' : 'desktop-forecast negative'}>
          <span>Prévision fin de mois</span>
          <strong>{money(forecastBalance)}</strong>
        </div>
      </div>

      <div className="desktop-dashboard-grid">
        <section className="desktop-chart-card">
          <div className="desktop-card-title">
            <div>
              <LineChart size={21} />
              <h3>Évolution budgétaire quotidienne</h3>
            </div>
            <span>Cliquez sur un point pour consulter les opérations</span>
          </div>

          {series.length === 0 ? (
            <p className="desktop-empty">Aucune donnée disponible pour ce mois.</p>
          ) : (
            <>
              <div className="desktop-chart-legend" aria-hidden="true">
                <span><i className="is-available" />Disponible calculé</span>
                <span><i className="is-expenses" />Dépenses cumulées</span>
                <span><i className="is-projected" />Point prévisionnel</span>
              </div>
              <div className="desktop-line-chart">
                <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Évolution quotidienne du disponible et des dépenses cumulées">
                  {chartTicks.map((tick, index) => {
                    const y = geometry.y(tick);
                    return (
                      <g key={`${tick}-${index}`}>
                        <line className="desktop-grid-line" x1={geometry.padding.left} x2={geometry.width - geometry.padding.right} y1={y} y2={y} />
                        <text className="desktop-axis-label" x={geometry.padding.left - 10} y={y + 4} textAnchor="end">{shortMoney(tick)}</text>
                      </g>
                    );
                  })}
                  <polyline className="desktop-line desktop-line-available" points={geometry.points('available')} />
                  <polyline className="desktop-line desktop-line-expenses" points={geometry.points('cumulativeExpenses')} />
                  {series.map((row, index) => {
                    const cx = geometry.x(index);
                    const cy = geometry.y(row.available);
                    return (
                      <g
                        className={row.projected ? 'desktop-chart-point is-projected' : 'desktop-chart-point'}
                        key={`${row.date}-${index}`}
                        role="button"
                        tabIndex="0"
                        aria-label={`${row.date}, disponible ${money(row.available)}, dépenses cumulées ${money(row.cumulativeExpenses)}`}
                        onClick={() => selectPoint(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') selectPoint(row);
                        }}
                      >
                        <circle cx={cx} cy={cy} r={selectedPoint?.date === row.date ? 7 : 4.5} />
                      </g>
                    );
                  })}
                  {series.map((row, index) => (
                    (index === 0 || index === series.length - 1 || row.day % 5 === 0) ? (
                      <text className="desktop-day-label" x={geometry.x(index)} y={geometry.height - 12} textAnchor="middle" key={`day-${row.date}`}>{row.day}</text>
                    ) : null
                  ))}
                </svg>
              </div>
              <div className="desktop-point-detail" aria-live="polite">
                {selectedPoint ? (
                  <>
                    <div><span>{selectedPoint.projected ? 'Prévision au' : 'Situation au'} {selectedPoint.date.split('-').reverse().join('/')}</span><strong>{money(selectedPoint.available)}</strong></div>
                    <div><span>Dépenses du jour</span><strong>{money(selectedPoint.expenses)}</strong></div>
                    <div><span>Dépenses cumulées</span><strong>{money(selectedPoint.cumulativeExpenses)}</strong></div>
                  </>
                ) : (
                  <span>Sélectionnez un point de la courbe pour afficher son détail.</span>
                )}
              </div>
            </>
          )}
        </section>

        <aside className="desktop-closing-card">
          <div className="desktop-card-title">
            <div><CalendarCheck2 size={21} /><h3>Contrôle du mois</h3></div>
            <span>{checks.filter((check) => check.status === 'done').length}/{checks.length} conformes</span>
          </div>
          <div className="desktop-closing-list">
            {checks.map((check) => (
              <button type="button" className={`desktop-closing-row is-${check.status}`} key={check.id} onClick={() => onCheckSelect?.(check.id)}>
                <span className="desktop-check-icon"><StatusIcon status={check.status} /></span>
                <span><strong>{check.label}</strong><small>{check.detail}</small></span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
          <div className="desktop-scheduled-summary">
            <ReceiptText size={19} />
            <span>Dépenses encore programmées</span>
            <strong>{money(scheduledTotal)}</strong>
          </div>
        </aside>

        <section className="desktop-categories-card">
          <div className="desktop-card-title">
            <div><CircleDollarSign size={21} /><h3>Dépenses par catégorie</h3></div>
            <span>Cliquez pour ouvrir l’historique filtré</span>
          </div>
          <div className="desktop-category-bars">
            {expenseCategories.map((category) => (
              <button type="button" className="desktop-category-row" key={category.id} onClick={() => onCategorySelect?.(category.id)}>
                <span>{category.label}</span>
                <span className="desktop-category-track"><i style={{ width: `${Math.max((category.total / maxCategory) * 100, 3)}%` }} /></span>
                <strong>{money(category.total)}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
