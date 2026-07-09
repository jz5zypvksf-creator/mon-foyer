# Mon Foyer

Application PWA React pour Alain et Esther afin de suivre le budget familial mensuel : revenus, frais fixes, depenses variables, budget nourriture, epargne et historique des operations.

## Installation

```bash
npm install
```

## Lancer en local

```bash
npm run dev
```

Ouvrir ensuite l'adresse affichee par Vite, souvent `http://localhost:5173`.

## Construire la version de production

```bash
npm run build
```

Le resultat est genere dans le dossier `dist`.

## Installer sur iPhone avec Safari

1. Lancer l'application en ligne ou sur une adresse accessible depuis l'iPhone.
2. Ouvrir l'adresse dans Safari.
3. Toucher le bouton de partage.
4. Choisir `Sur l'ecran d'accueil`.
5. Valider le nom `Mon Foyer`.

L'application s'ouvrira ensuite comme une app installee, avec son icone et son affichage plein ecran.

## Notes techniques

- Stockage local via `localStorage` pour la v1.0.
- Donnees separees en `operations`, `categories`, `stores` et `savingsGoals`.
- Structure preparee pour remplacer plus tard le stockage local par Supabase.
- Clavardage familial via Supabase, table `public.messages`.
- Configurer Supabase avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env`.
