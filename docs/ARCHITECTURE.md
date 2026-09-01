# Architecture de Mon Foyer

## Construction de l’application

Vite sert uniquement à compiler l’application React. Le fichier `vite.config.js`
doit rester déclaratif et ne doit jamais modifier le contenu de `src/App.jsx`,
`src/BelfiusAudit.jsx` ou d’un autre fichier source.

Toute évolution fonctionnelle doit être appliquée directement dans `src/`, puis
être couverte par un test. Le test `src/lib/buildConfiguration.test.js` protège
cette règle et détecte le retour de transformations `replace` pendant le build.

## Invariants métier sensibles

- Une opération annulée ne doit jamais modifier les soldes ni l’historique.
- Une opération de type `reimbursement` reste distincte d’un revenu ordinaire.
- Le rapprochement Belfius est effectué dans `BelfiusAudit.jsx`; aucun composant
  enveloppe ni observateur du DOM ne doit injecter cette fonction après rendu.
- Les calculs de clôture mensuelle doivent continuer à passer par les fonctions
  normalisées de `App.jsx`, sans duplication dans l’interface.

## Points de vigilance

- `App.jsx` concentre encore plusieurs responsabilités. Les prochaines grandes
  fonctionnalités devraient extraire des composants et des fonctions métier
  testables plutôt que prolonger ce fichier.
- Vérifier les parcours Ajout, Annulation, Historique, Loisirs et Belfius après
  toute modification des opérations ou des catégories.
- Exécuter `npm test`, `npm run build` et `npm run verify:recovery` avant fusion.
- Le bundle principal dépasse actuellement 500 kB. Une future optimisation peut
  charger les écrans secondaires à la demande avec `React.lazy`.
