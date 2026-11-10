# ADR-0002 — Outillage qualité et CI

- **Statut :** Accepté
- **Date :** 2026-11-10
- **Décideur :** développeur unique
- **Portée :** garde-fous qualité avant l’écriture du code métier (Phase 1, étape 2)
- **Complète :** ADR-0001 (monorepo pnpm + Docker Compose)

## Contexte

L’étape 1 a livré le monorepo et l’infrastructure locale. Aucune ligne de code
applicatif n’existe encore, mais on va en écrire beaucoup dans les étapes
suivantes (Express, Prisma, worker BullMQ, React). Il faut poser les garde-fous
**avant** que le code n’existe, sinon ils seront toujours reportés.

Trois contraintes cadrent cette étape :

1. Le cadrage impose TypeScript strict, zéro `any`, et une CI verte comme
   condition de fin de tâche (Definition of Done).
2. Le budget est nul → pas d’outil payant, pas de service SaaS.
3. Le projet est solo mais doit se comporter comme une équipe (PR, review
   interne, CI bloquante).

Il faut choisir : les outils de lint/format, la stratégie de tests, et la forme
du pipeline CI.

## Décision

### 1. ESLint 9 en flat config, un seul fichier à la racine

- `eslint.config.js` unique à la racine, partagé par les 4 workspaces.
- ESLint **9.x** (pas 10). Version figée via `pnpm-lock.yaml`.
- Linting **type-aware** activé (`projectService: true`, `tsconfigRootDir: __dirname`).
- Presets : `js.configs.recommended`, `tseslint.configs.strictTypeChecked`,
  `tseslint.configs.stylisticTypeChecked`, puis `eslint-config-prettier` en
  dernier.
- Règles projet ajoutées par-dessus les presets :
  - `@typescript-eslint/no-explicit-any: error` (cadrage)
  - `@typescript-eslint/no-floating-promises: error`
  - `@typescript-eslint/consistent-type-imports: error`
  - `@typescript-eslint/no-unused-vars` avec `argsIgnorePattern: ^_`
  - `curly: ['error', 'all']`
- Les fichiers `*.config.*` et `*.test.ts` sont exemptés du type-checking
  (`tseslint.configs.disableTypeChecked`) : plus rapide, évite les faux positifs
  sur les configs Vitest.

**Pourquoi un seul fichier racine :** 4 workspaces, tous en TypeScript strict,
mêmes règles. Dupliquer la config créerait de la divergence silencieuse. Si le
front React a un jour besoin d’exceptions (JSX, règles spécifiques), on ajoutera
un bloc `files: ['apps/web/**/*.tsx']` dans ce même fichier — pas un second
fichier.

**Pourquoi rester en ESLint 9 et ignorer le warning `deprecated` :**
`typescript-eslint` v8 (stable) ne déclare pas encore `eslint@10` dans ses peer
dependencies. Passer en 10 maintenant casserait `pnpm lint`. On fera la bascule
groupée (eslint 10 + typescript-eslint 9 + eslint-config-prettier compatible)
dans une étape dédiée, avec ADR.

**Pourquoi type-aware :** interdit `any` implicite, détecte les promesses non
gérées, les `await` inutiles, les erreurs de typage dans les comparaisons. Coût
acceptable (lint complet ~8 s sur 4 workspaces, mesuré localement).

### 2. Prettier à la racine, `format:check` en CI

- `.prettierrc` unique : `semi: true`, `singleQuote: true`, `trailingComma: "all"`,
  `printWidth: 100`, `tabWidth: 2`, `endOfLine: "lf"`.
- `.prettierignore` : `node_modules/`, `dist/`, `coverage/`, `.pnpm-store/`,
  `pnpm-lock.yaml`.
- La CI exécute `prettier --check .` (pas `--write`). Un désaccord de formatage
  échoue le job → le développeur corrige localement via `pnpm format`.

**Pourquoi `--check` et pas `--write` en CI :** la CI ne doit jamais modifier le
code. Elle vérifie. Le formatage est une responsabilité locale.

**Pourquoi `eslint-config-prettier` en dernier dans la config ESLint :**
neutralise les règles ESLint de style qui entreraient en conflit avec Prettier
(indentation, quotes, semi). Sans cette ligne, deux outils se disputeraient les
mêmes règles et la CI serait incohérente.

### 3. Vitest en `passWithNoTests` dans `api` et `worker`

- Config Vitest créée dans `apps/api` et `apps/worker` uniquement.
- `passWithNoTests: true` → `vitest run` sort en code 0 tant qu’aucun test
  n’existe.
- Pas de config Vitest dans `apps/web` ni `packages/shared` à cette étape.

**Pourquoi `passWithNoTests` :** sans ce flag, `vitest run` sort en erreur
« No test files found » et la CI serait rouge avant le premier test. Le flag
sera retiré de chaque workspace dès qu’un premier test y est ajouté.

**Pourquoi pas de Vitest dans `web` :** le front React n’existe pas encore.
Vitest + React Testing Library + `jsdom` seront ajoutés lors de l’initialisation
de React.

### 4. GitHub Actions : 3 jobs parallèles

- `.github/workflows/ci.yml`, déclenché sur `push` et `pull_request` ciblant
  `main`.
- 3 jobs sans dépendance : `lint`, `test`, `docker`.
- `concurrency` avec `cancel-in-progress: true` → annule les runs obsolètes sur
  la même branche.
- `permissions: contents: read` → least privilege.
- Cache pnpm natif via `actions/setup-node` avec `cache: 'pnpm'`.
- `pnpm install --frozen-lockfile` dans chaque job.
- Job `docker` : `cp .env.example .env`, puis `docker compose up -d --wait`,
  `docker compose ps`, `docker compose down -v` en `if: always()`.

**Pourquoi 3 jobs parallèles plutôt que séquentiels :** repo public → minutes
CI illimitées sur les runners standard. Le feedback est plus rapide et les
échecs sont isolés (un job Docker cassé n’empêche pas de voir que le lint est
vert). Un `needs: [lint, test]` serait plus économe en minutes mais plus lent.

**Pourquoi `--wait` sur `docker compose up` :** nos 3 services ont un
healthcheck. `--wait` bloque jusqu’à ce que les 3 soient `healthy`, au lieu de
considérer un service prêt dès que le conteneur démarre. C’est la seule façon
fiable de détecter un Postgres qui refuse de s’initialiser ou un Silo qui ne
répond pas encore.

**Pourquoi `down -v` :** en CI, les volumes sont éphémères, mais `-v` garantit
un état propre même en cas d’échec, et évite des surprises si on ajoute des
tests d’intégration base de données plus tard.

**Pourquoi `cache: 'pnpm'` plutôt qu’`actions/cache` manuel :** `setup-node`
calcule automatiquement la clé de cache à partir de `pnpm-lock.yaml` et gère
l’invalidation. `actions/cache` manuel demanderait de maintenir un chemin
(`~/.local/share/pnpm/store`) et une clé — code custom à maintenir pour un
gain nul.

**Pourquoi `--frozen-lockfile` :** interdit à pnpm de mettre à jour
`pnpm-lock.yaml` en CI. Si une dépendance a été ajoutée sans lock mis à jour,
le job échoue immédiatement au lieu de résoudre silencieusement une version
différente de celle du développeur.

### 5. `"type": "module"` dans tous les `package.json`

- Racine, `apps/*`, `packages/shared` déclarent tous `"type": "module"`.

**Pourquoi :** `eslint.config.js` utilise la syntaxe ESM (`import`). Sans
`"type": "module"`, Node tente d’abord de parser en CommonJS, échoue, puis
reparse en ESM en émettant `MODULE_TYPELESS_PACKAGE_JSON`. Le warning est
cosmétique mais bruyant, et il laisse planer un doute sur le mode de résolution
réel. Déclarer ESM explicitement supprime l’ambiguïté et le warning.

### 6. Scripts de convenance à la racine

- `lint`, `format`, `format:check`, `typecheck`, `test` → délèguent à
  `pnpm -r <script>`.
- `infra:*` → délèguent à `docker compose`.

**Pourquoi :** une commande unique, indépendante de l’emplacement du
développeur (racine, app, CI), pour chaque action de qualité. La CI n’invoque
que ces scripts — si on change d’outil, on change le script, pas la CI.

## Conséquences

### Positives

- Garde-fous en place **avant** le code métier : aucune dette de qualité
  accumulée ne sera tolérée.
- CI complète en ~2–3 minutes sur repo public, gratuite.
- Un seul fichier de config par outil → modification centralisée.
- Les ADRs futurs (Prisma, auth, LLM) pourront référencer l’ADR-0002 pour les
  aspects outillage.
- Cache pnpm natif → temps d’install ~10 s en cache hit.

### Négatives / coûts

- Lint type-aware plus lent qu’un lint non typé (~8 s vs ~2 s). Acceptable à
  cette échelle ; à réévaluer si le monorepo grossit significativement.
- `passWithNoTests` masque temporairement l’absence de tests → **mitigation** :
  flag retiré workspace par workspace dès le premier test ajouté.
- Le job Docker dépend de la stabilité des healthchecks. Si Silo devient lent
  sur les runners froids, `--wait-timeout` devra être augmenté.
- Pas de pre-commit hooks (husky/lint-staged) → la CI est le seul garde-fou
  automatisé. **Mitigation** : envisageable plus tard, non prioritaire tant que
  le développeur est unique.

### Neutres

- Prettier est configuré pour `printWidth: 100` — un futur dev avec un écran
  étroit pourrait préférer 80. Décision réversible, un seul fichier à changer.
- Vitest 2.x est utilisé. Vitest 3 sortira, la migration sera documentée dans
  un ADR dédié si elle casse le `passWithNoTests`.

## Alternatives considérées

- **Biome au lieu d’ESLint + Prettier** : rejeté pour cette étape. Biome
  remplacerait deux outils par un, mais son support du type-aware est encore
  limité (pas d’équivalent à `no-floating-promises` basé sur les types).
  Réévaluable si le besoin de simplification devient fort.
- **ESLint 10** : rejeté (cf. section 1). Bascule groupée plus tard.
- **Config ESLint par workspace** : rejeté, duplication inutile à cette échelle.
- **`actions/cache` manuel pour pnpm** : rejeté, `cache: 'pnpm'` de
  `setup-node` fait mieux sans code custom.
- **Job Docker séquentiel (`needs: [lint, test]`)** : rejeté, repo public donc
  minutes gratuites, feedback parallèle préféré.
- **Husky + lint-staged (pre-commit)** : reporté. La CI suffit tant que le
  développeur est unique. À réintroduire si des contributeurs externes
  rejoignent le projet.
- **Suppression pure et simple du healthcheck Silo** : rejeté, `curl` est
  disponible dans `pgsty/silo:latest` (vérifié : `/usr/bin/curl`), donc
  `/minio/health/live` fonctionne.

## Références

- ESLint flat config : <https://eslint.org/docs/latest/use/configure/configuration-files>
- typescript-eslint type-aware : <https://typescript-eslint.io/getting-started/typed-linting>
- Vitest `passWithNoTests` : <https://vitest.dev/config/#passwithnotests>
- `docker compose up --wait` : <https://docs.docker.com/compose/reference/up/>
- `setup-node` cache pnpm : <https://github.com/actions/setup-node#caching-global-packages-data>
- ADR-0001 : `0001-monorepo-pnpm-docker-compose.md`
