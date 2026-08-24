# Mon Foyer

Application PWA React/Vite de gestion du budget familial. La source de vérité partagée est Supabase ; un cache local permet la consultation et la saisie hors connexion, puis la synchronisation au retour du réseau.

## Fonctions principales

- opérations, revenus, remboursements et transferts d'épargne ;
- soldes Belfius, chèques-repas et audit mensuel par CSV ;
- suivi Mastercard séparant achat, encours et règlement bancaire ;
- dépenses Loisirs/Vacances et fonctionnement hors connexion ;
- budget nourriture du foyer et analyse factuelle ;
- paramètres protégés, sauvegarde JSON et rappels ;
- tableau de bord adapté à l'iPhone et à l'ordinateur.

## Installation reproductible

Prérequis : Node.js 22 et npm.

```bash
git clone https://github.com/jz5zypvksf-creator/mon-foyer.git
cd mon-foyer
cp .env.example .env.local
npm ci
npm test
npm run build
```

Renseigner dans `.env.local` les trois valeurs décrites dans `.env.example`, puis utiliser `npm run dev` pour le développement. Le résultat de production est généré dans `dist/`.

## Contrôles

```bash
npm test
npm run build
npm run verify:recovery
```

GitHub Actions exécute automatiquement `npm ci`, les tests et le build sur chaque pull request et sur `main`.

## Données et sécurité

- Ne jamais versionner `.env`, `.env.local`, une clé `service_role`, un export JSON financier ou un numéro complet de carte.
- Le dépôt contient uniquement le code et les évolutions SQL ; les données courantes restent dans Supabase.
- L'interface **Réglages → Sauvegarde et récupération** produit la seconde copie portable des données au format JSON.
- Les tables financières Supabase utilisent la sécurité par ligne (RLS).

## Reprise après incident

La procédure complète, l'inventaire Supabase vérifié et l'ordre de restauration sont décrits dans [docs/DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md).
