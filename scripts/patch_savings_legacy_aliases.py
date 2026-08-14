from pathlib import Path

p = Path('src/App.jsx')
s = p.read_text()

old = """  if (text.includes('vacance') || text.includes('loisir')) return 'vacances';
  if (text.includes('garage') || text.includes('entretien vehicule')) return 'garage';
  if (text.includes('taxe') || text.includes('impot')) return 'taxes';
  if (text.includes('solde peugeot')) return 'solde_peugeot';
  if (text.includes('frais divers maison') || text.includes('frais divers foyer')) return 'frais_maison';
  if (text.includes('pension alain')) return 'pension_alain';
  if (text.includes('pension esther')) return 'pension_esther';
  if (text.includes('voiture') || text.includes('auto')) return 'voiture';
  if (text.includes('pension')) return 'pension';
  if (text.includes('urgence')) return 'urgence';
  if (text.includes('maison')) return 'maison';
"""
new = """  if (text.includes('vacance') || text.includes('loisir')) return 'vacances';
  if (text.includes('garage') || text.includes('entretien vehicule')) return 'garage';
  if (text.includes('taxe') || text.includes('impot')) return 'taxes';
  if (text === 'voiture' || text.includes('solde peugeot') || text.includes('epargne voiture')) return 'solde_peugeot';
  if (text === 'maison' || text.includes('frais divers maison') || text.includes('frais divers foyer') || text.includes('epargne maison')) return 'frais_maison';
  if (text.includes('pension alain')) return 'pension_alain';
  if (text.includes('pension esther')) return 'pension_esther';
  if (text.includes('pension')) return 'pension';
  if (text.includes('urgence')) return 'urgence';
"""
if old not in s:
    raise SystemExit('Savings bucket mapping anchor missing')
s = s.replace(old, new, 1)

old_block = """      const savingsGoals = current.savingsGoals.map((goal) => {
        const bucket = savingsBucketForGoal(goal);
        const increment = increments[bucket] || 0;
        if (!increment) return goal;
        const next = { ...goal, saved: Number(goal.saved || 0) + increment };
        changedGoals.push(next);
        return next;
      });
"""
new_block = """      const representatives = new Map();
      current.savingsGoals.forEach((goal) => {
        const bucket = savingsBucketForGoal(goal);
        const previous = representatives.get(bucket);
        const weight = Math.abs(Number(goal.saved || 0)) * 100000 + Math.abs(Number(goal.target || 0));
        const previousWeight = previous ? Math.abs(Number(previous.saved || 0)) * 100000 + Math.abs(Number(previous.target || 0)) : -1;
        if (!previous || weight > previousWeight) representatives.set(bucket, goal);
      });
      const representativeIds = new Set([...representatives.values()].map((goal) => goal.id));
      const savingsGoals = current.savingsGoals.map((goal) => {
        const bucket = savingsBucketForGoal(goal);
        const increment = increments[bucket] || 0;
        if (!increment || !representativeIds.has(goal.id)) return goal;
        const next = { ...goal, saved: Number(goal.saved || 0) + increment };
        changedGoals.push(next);
        return next;
      });
"""
if old_block not in s:
    raise SystemExit('Savings increment block missing')
s = s.replace(old_block, new_block, 1)

p.write_text(s)
