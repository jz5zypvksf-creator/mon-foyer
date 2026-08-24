# Plan de reprise après sinistre — Mon Foyer

Dernière vérification : 24 août 2026.

Ce document permet de reconstruire l'application sans dépendre de l'ordinateur actuel. Il distingue trois sauvegardes : le code, la base Supabase et l'export financier JSON.

## 1. Copies indispensables

| Élément | Source de reprise | Contenu |
|---|---|---|
| Code et historique | dépôt GitHub `jz5zypvksf-creator/mon-foyer` | React, styles, tests, PWA, scripts SQL et documentation |
| Base partagée | projet Supabase | comptes, RLS, tables, migrations et données synchronisées |
| Copie portable | sauvegarde JSON téléchargée depuis Réglages | données financières, Loisirs, messages et dernier audit Belfius |
| Configuration | variables Vercel/Supabase, jamais dans Git | URL Supabase, clé publique anon, identifiant du foyer |

Le dépôt GitHub ne doit jamais contenir un export financier réel, un mot de passe, une clé privée ou le numéro complet d'une carte.

## 2. État Supabase constaté

Le 24 août 2026, le projet actif contient 20 tables publiques et la RLS est activée sur chacune :

`households`, `household_members`, `operations`, `stores`, `savings_goals`, `categories`, `recurring_fixed_expenses`, `bank_snapshots`, `leisure_expenses`, `household_budget_settings`, `care_people`, `messages`, `push_subscriptions`, `reminder_preferences` et les six tables `chronologie_*`.

La base conserve 19 migrations, jusqu'à `20260824085728_add_daily_purchase_reminder`. Les scripts SQL à la racine du dépôt documentent les principales évolutions financières : sécurité RLS, moyens de paiement, frais récurrents, audit Belfius, paramètres protégés, loisirs, registre comptable et Mastercard.

Important : ces scripts sont des évolutions idempotentes, pas un remplacement d'un export intégral Supabase. Pour reconstruire un projet Supabase entièrement disparu, restaurer d'abord une sauvegarde Supabase, puis vérifier et appliquer les migrations manquantes dans leur ordre enregistré.

## 3. Reconstruction du code

```bash
git clone https://github.com/jz5zypvksf-creator/mon-foyer.git
cd mon-foyer
cp .env.example .env.local
npm ci
npm run verify:recovery
npm test
npm run build
```

Compléter `.env.local` :

```dotenv
VITE_SUPABASE_URL=https://VOTRE-PROJET.supabase.co
VITE_SUPABASE_ANON_KEY=VOTRE_CLE_PUBLIQUE_ANON
VITE_HOUSEHOLD_ID=UUID_DU_FOYER
```

La clé `anon` est publique et destinée au navigateur ; la protection des données dépend de l'authentification et des règles RLS. Une clé `service_role` ne doit jamais être ajoutée au frontend.

## 4. Reconnexion à Supabase

1. Récupérer les variables dans les paramètres du projet Supabase/Vercel.
2. Les renseigner dans `.env.local` et dans les variables d'environnement Vercel.
3. Lancer les tests et le build.
4. Se connecter avec un compte membre du foyer.
5. Vérifier opérations, épargne, frais récurrents, Loisirs et dernier audit Belfius.
6. Contrôler qu'une saisie de test se synchronise sur un second appareil, puis la supprimer si elle n'a aucune valeur comptable.

## 5. Restauration JSON

Utiliser **Restaurer en fusionnant** uniquement si des données manquent dans Supabase ou après création d'une base de remplacement. La fusion conserve les éléments déjà présents et évite les doublons connus.

Avant toute restauration :

1. télécharger un nouveau point de sécurité ;
2. vérifier que le fichier sélectionné est déclaré intact et appartient au foyer ;
3. restaurer en fusionnant ;
4. contrôler les totaux, le nombre d'opérations, l'épargne et le dernier audit Belfius sur deux appareils.

Rythme recommandé : une sauvegarde JSON chaque semaine et une archive à la fin de chaque mois, dont au moins une copie hors de l'ordinateur principal.

## 6. Remise en production

1. Connecter le dépôt GitHub à Vercel.
2. Définir les trois variables `VITE_*` pour Production et Preview.
3. Déployer la branche `main`.
4. Ouvrir l'application en ligne une première fois pour mettre à jour le cache PWA.
5. Tester connexion, saisie, synchronisation, hors connexion, sauvegarde JSON et audit Belfius.

Sur iPhone, si une ancienne PWA reste figée après déploiement : repasser en ligne, fermer et rouvrir l'application, puis actualiser Safari. Réinstaller l'icône d'écran d'accueil seulement si le cache ne se renouvelle pas.

## 7. Contrôle périodique

- Hebdomadaire : télécharger la sauvegarde JSON.
- Mensuel : conserver une archive JSON et effectuer l'audit Belfius.
- Avant une évolution : vérifier que Git est propre et créer une branche.
- Après une évolution : `npm ci`, `npm test`, `npm run build`, puis validation iPhone et ordinateur.
- Régulièrement : consulter les conseillers sécurité et performance Supabase.

Dernier audit Supabase : aucune table publique sans RLS. Un avertissement Auth subsiste concernant la protection contre les mots de passe compromis, option liée à l'offre Supabase. Les remarques de performance restantes concernent principalement les tables Chronologie et ne bloquent pas Mon Foyer.

Référence : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
