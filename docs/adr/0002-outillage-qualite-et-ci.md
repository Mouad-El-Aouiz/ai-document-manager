# ADR-0002 — Outillage qualité et pipeline CI

- **Statut :** Accepté
- **Date :** 2026-11-10
- **Portée :** garde-fous qualité avant le code métier

## Contexte

Aucune ligne de code applicatif n’existe encore. Les garde-fous (lint, format,
types, tests, CI) doivent être posés **avant** que la dette ne s’installe.
Contraintes du cadrage : TypeScript strict, zéro `any`, CI verte comme
condition de fin de tâche, budget 0 $.

## Décision

### 1. ESLint 9 en flat config, un seul fichier à la racine

- `eslint.config.js` unique, partagé par les 4 workspaces.
- Presets : `js.configs.recommended`, `tseslint.configs.strictTypeChecked`,
  `tseslint.configs.stylisticTypeChecked`, puis `eslint-config-prettier` en
  dernier.
- Linting **type-aware** activé (`projectService: true`).
- Règles projet en surcouche : `no-explicit-any: error`,
  `no-floating-promises: error`, `consistent-type-imports: error`,
  `curly: all`, `no-unused-vars` avec `argsIgnorePattern: ^_`.

**Pourquoi un seul fichier :** 4 workspaces, mêmes règles. Dupliquer créerait de
la divergence. Si le front React a besoin d’exceptions, on ajoute un bloc
`files: ['apps/web/**/*.tsx']` dans ce même fichier.

**Pourquoi rester en ESLint 9 :** `typescript-eslint` v8 ne supporte pas
`eslint@10` (peer dependency). Bascule groupée reportée, avec ADR dédié.

### 2. Prettier à la racine, `--check` en CI

- `.prettierrc` : `semi: true`, `singleQuote: true`, `trailingComma: "all"`,
  `printWidth: 100`, `endOfLine: "lf"`.
- La CI exécute `prettier --check .`. Correction locale via `pnpm format`.

**Pourquoi `--check` en CI :** la CI ne modifie jamais le code, elle vérifie.

### 3. Vitest configuré dans `api` et `worker`

- `passWithNoTests: true` tant qu’aucun test n’existe.
- `apps/web` et `packages/shared` : pas de Vitest (front React et Zod tests
  viendront à leurs étapes).
- Retiré workspace par workspace dès le premier test ajouté.

### 4. GitHub Actions : 3 jobs parallèles

- `lint` : ESLint + Prettier `--check` + `tsc --noEmit`.
- `test` : `pnpm test` (avec service Postgres en étape ultérieure).
- `docker` : `cp .env.example .env` puis `docker compose up -d --wait`, puis
  `down -v` en `if: always()`.
- Cache pnpm natif via `actions/setup-node` `cache: 'pnpm'`.
- `--frozen-lockfile` dans chaque job.
- `concurrency` avec `cancel-in-progress`, `permissions: contents: read`.

**Pourquoi 3 jobs parallèles :** repo public → minutes illimitées, feedback
rapide, échecs isolés. Un `needs: [lint, test]` serait plus économe mais plus
lent.

**Pourquoi `--wait` :** nos 3 services ont un healthcheck → seul moyen fiable
de détecter un Postgres qui refuse de démarrer.

### 5. `"type": "module"` dans tous les `package.json`

- Élimine le warning `MODULE_TYPELESS_PACKAGE_JSON` et rend explicite la
  résolution ESM d’`eslint.config.js`.

## Conséquences

**Positives**

- Garde-fous posés avant le code métier : zéro dette accumulée.
- CI complète en 2–3 minutes, gratuite.
- Un seul fichier de config par outil → modification centralisée.

**Négatives**

- Lint type-aware plus lent qu’un lint non typé (~8 s vs ~2 s). Acceptable,
  à réévaluer si le monorepo grossit.
- Pas de pre-commit hooks (husky). La CI est le seul garde-fou automatisé.
  Réintroduisible si des contributeurs externes rejoignent.

## Alternatives écartées

- **Biome** au lieu d’ESLint + Prettier : support type-aware encore limité.
- **ESLint 10** : non supporté par `typescript-eslint` v8.
- **`actions/cache` manuel** : `cache: 'pnpm'` de `setup-node` fait mieux.
- **Husky + lint-staged** : reporté, non prioritaire en solo.

## Références

- <https://eslint.org/docs/latest/use/configure/configuration-files>
- <https://typescript-eslint.io/getting-started/typed-linting>
- ADR-0001 : `0001-monorepo-et-infra-docker.md`