# ADR-0004 — API, authentification et conventions

- **Statut :** Accepté
- **Date :** 2026-11-13
- **Portée :** Phase 4 complète (fondations API + auth)
- **Complète :** ADR-0003 (schéma DB et RLS)

## Contexte

La Phase 4 livre les fondations de l'API : Express, config, logs, gestion
d'erreurs, isolation tenant, authentification, autorisation. Ce document
consolide l'ensemble des décisions prises, qui remplacent les ADRs unitaires
initialement envisagés (withTenant, auth, RBAC, conventions API). Un seul
ADR couvre la phase pour garder la documentation lisible en solo.

## Décisions

### 1. Architecture Express en 4 couches

- `src/routes/*` : déclaration des routes, middlewares, wiring
- `src/controllers/*` : HTTP uniquement (req/res, cookies, status)
- `src/services/*` : logique métier, orchestration
- `src/repositories/*` : seul endroit qui parle à Prisma

**Pourquoi 4 couches :** un controller qui parle directement à Prisma devient
rapidement un fourre-tout. La séparation rend les tests unitaires triviaux et
force à typer les contrats entre couches.

**Pourquoi `app.ts` séparé de `server.ts` :** `createApp(deps)` retourne
l'instance Express sans `listen()`. Supertest teste l'API sans ouvrir de port
réel, et les dépendances (Prisma, Redis, logger) sont injectables.

### 2. Configuration env validée par Zod au démarrage

- `src/config/env.ts` : schéma Zod strict, parsé **une fois** via `loadEnv()`
- Objet gelé (`Object.freeze`) pour empêcher toute mutation
- `process.exit(1)` avec message lisible si invalide
- **Seule exception** autorisée à `process.env` : ce fichier. Une règle ESLint
  (`no-restricted-properties`) interdit `process.env` partout ailleurs dans `src/`.

**Pourquoi un parsing unique :** un oubli de variable d'environnement doit
crasher au démarrage, pas au premier appel de la fonction qui en a besoin.
`Object.freeze` protège contre les mutations accidentelles après import.

### 3. Logs structurés et AsyncLocalStorage

- `pino` + `pino-http` + `pino-pretty` (dev uniquement)
- `AsyncLocalStorage` propage `requestId`, `userId`, `organizationId` sans
  paramètre explicite
- `mixin` pino injecte le contexte dans **chaque** ligne de log
- `X-Request-Id` entrant réutilisé **uniquement s'il est un UUID valide**
  (anti log injection), sinon généré
- **Redaction pino** : `authorization`, `cookie`, `password`, `refreshToken`

**Pourquoi AsyncLocalStorage plutôt qu'injection du logger :** injecter un
logger partout pollue les signatures et force à le passer à chaque fonction.
L'ALS permet à n'importe quel log émis dans la requête de porter l'ID
automatiquement.

### 4. Erreurs et validation

- `AppError` avec `statusCode`, `code` stable, `message`, `details?`
- Codes stables : `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`,
  `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`
- Format de réponse unique : `{ error: { code, message, details?, requestId } }`
- Middleware `validate({ body, query, params })` : parse Zod et remplace
  `req.body` / `req.query` / `req.params` par les versions typées
- Toute erreur inattendue → log avec stack côté serveur, réponse générique
  `{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }` côté client

**Pourquoi des codes stables :** le front peut brancher des comportements
(bannir après plusieurs `UNAUTHENTICATED`, rediriger après `RATE_LIMITED`) sans
parser les messages. Les messages restent libres d'évoluer.

### 5. Multi-tenant : `withTenant` explicite

- **Pas d'extension Prisma** qui injecterait le tenant automatiquement
- Transaction explicite via `prisma.$transaction`
- `SELECT set_config('app.organization_id', $1, true)` — version paramétrée
  de `SET LOCAL` (les paramètres bindés empêchent l'injection SQL)
- Type `TenantTx` exporté, seul accepté par les repositories
- Validation UUID avant l'appel

**Pourquoi pas d'extension Prisma :** avec un pool de connexions, on ne peut
pas garantir que le `SET LOCAL` s'exécutera sur la même connexion que la
requête suivante. La transaction explicite garantit que le contexte PostgreSQL
est bien posé.

**Pourquoi `TenantTx` :** un repository qui accepte `TenantTx` (et non
`PrismaClient`) ne peut physiquement pas être appelé sans contexte tenant. Le
compilateur l'impose — pas la revue de code.

**RLS fail-closed :** policies avec `NULLIF(current_setting('app.organization_id', true), '')::uuid`.
Si `SET LOCAL` n'est pas appelé, la variable est `NULL`, la comparaison renvoie
`FALSE`, zéro ligne. Pas d'erreur, pas de fuite. `WITH CHECK` ajouté pour
sécuriser les INSERT/UPDATE.

### 6. Authentification

- **Access token JWT** (HS256, `jose`, 15 min) : `sub`, `org`, `role`, `jti`
- **Refresh token opaque** (32 bytes base64url) + rotation + détection de vol
- Refresh stocké **haché SHA-256** en base (`RefreshToken.tokenHash` unique)
- **Famille de tokens** (`familyId`) : un replay révoque **toute** la famille
- Cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`
- Access token dans le corps de la réponse, jamais en `localStorage`
- **Anti-énumération timing** : `PasswordService.verifyDummy()` appelé si
  l'email est inconnu, pour que le temps de réponse soit constant

**Pourquoi opaque + stocké haché :** un JWT de refresh ne peut pas être révoqué.
Un token opaque avec un hash SHA-256 en base garantit qu'un dump de la DB ne
donne aucun token utilisable, et permet la révocation immédiate.

**Pourquoi rotation :** si un attaquant vole le refresh token, la première
rotation légitime (par la victime) et la tentative d'utilisation par
l'attaquant **détectent** le vol (double consommation), et révoquent toute la
famille.

**Pourquoi PostgreSQL pour les refresh :** Redis serait plus rapide mais ne
survit pas à un redémarrage sans AOF. La durabilité et la révocation par
utilisateur (`revokedAt`) sont plus importantes que la latence (~1 ms).

### 7. Lookup de login via SECURITY DEFINER

- `User` est sous RLS, mais au login on ne connaît pas l'`organizationId`
- Fonction PostgreSQL `auth_lookup_user(email)` en `SECURITY DEFINER`
- `SET search_path = public, pg_temp` (anti schema hijacking)
- Retourne uniquement `id`, `organization_id`, `password_hash`, `role`
- `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO aidm_app`

**Pourquoi SECURITY DEFINER :** c'est le mécanisme PostgreSQL standard pour
un lookup contrôlé hors RLS. L'alternative (désactiver la RLS globalement) est
catastrophique.

**Pourquoi le principe du moindre privilège :** la fonction ne retourne que
4 colonnes, pas la ligne entière. Même compromise, elle ne fuit rien d'autre.

### 8. Autorisation : RBAC par permissions

- `requirePermission('document:write')` sur les routes
- Mapping rôle → permissions centralisé (`rbac.ts`)
- `ADMIN` = wildcard `*`
- `EDITOR` et `VIEWER` listent explicitement leurs permissions

**Pourquoi permissions vs rôles :** `if (role === 'ADMIN')` éparpille la
logique dans toutes les routes. Centraliser dans un mapping permet d'ajouter un
rôle (`AUDITOR`) en modifiant **un seul fichier**.

**Pourquoi RBAC complète la RLS :** la RLS filtre **par tenant**. Le RBAC
filtre **par rôle dans ce tenant**. Les deux sont nécessaires (un EDITOR d'Acme
ne doit pas voir les dossiers d'Acme pour autant, mais il ne doit pas non plus
pouvoir supprimer l'organisation).

### 9. Rate limiting

- `rate-limiter-flexible` + Redis
- Login : 5 tentatives / 15 min, clé = `${ip}:${email}`
- **Désactivé en `NODE_ENV=test`** (sinon les tests se bloquent entre eux)
- Erreur standard `RATE_LIMITED` (429) sur dépassement

**Pourquoi IP + email combinés :** limiter par IP seule permet à un attaquant
de verrouiller un compte légitime (DoS distribué). Limiter par IP+email
protège contre le brute-force sans permettre le déni de service ciblé.

### 10. Routes et conventions HTTP

- Versioning par préfixe `/api/v1/...` (routes métier)
- `/health` et `/health/live` restent à la racine (healthchecks infra)
- Login : `POST /api/v1/auth/login`
- Refresh : `POST /api/v1/auth/refresh`
- Logout : `POST /api/v1/auth/logout`
- Me : `GET /api/v1/auth/me`

### 11. Tests

- **Vitest + Supertest** pour les tests E2E (pas de port ouvert)
- **Deux clients Prisma** dans les tests :
  - `adminPrisma` (`DATABASE_URL_MIGRATE`, superuser) : setup, cleanup, assertions bypass RLS
  - `prisma` (`DATABASE_URL`, `aidm_app`) : assertions de la vraie API
- **Isolation entre tests** : `beforeEach` nettoie les `RefreshToken` des users
  concernés pour éviter les fuites d'état
- **CI** : services Postgres+Redis + création de `aidm_app` + application de
  `rls.sql` + seed avant les tests

**Pourquoi deux clients :** tester la RLS nécessite de vérifier que l'API
voit ce qu'elle doit voir (via `aidm_app`) et de préparer/nettoyer l'état
(via superuser). Les deux rôles ont des responsabilités distinctes.

### 12. OpenAPI

- Génération depuis Zod via `@asteasolutions/zod-to-openapi`
- Servie sur `/api/v1/docs` en dev uniquement (`NODE_ENV !== 'production'`)
- Les schémas Zod existants (login, errors, health) sont réutilisés

**Pourquoi générer depuis Zod :** une seule source de vérité. Le schéma Zod
valide la requête **et** documente l'API. Pas de dérive entre doc et code.

## Conséquences

### Positives

- Isolation multi-tenant garantie à deux niveaux (RLS + RBAC)
- Auth complète, rotation de tokens, détection de vol
- Logs structurés traçables (request → user → org)
- Tests E2E couvrant la chaîne complète JWT → org → RLS
- Configuration validée au démarrage (fail-fast)

### Négatives

- Deux sources de config Prisma (`DATABASE_URL` et `DATABASE_URL_MIGRATE`) à
  maintenir synchronisées. Mitigation : `db:rls` synchronise le mot de passe.
- `AsyncLocalStorage` a un coût mémoire négligeable mais non nul.
- Tests E2E dépendent du seed. Mitigation : `beforeAll` échoue clairement avec
  "Seed missing" si oublié.
- OpenAPI minimal (quelques routes) : à enrichir en Phase 5 pour les routes
  documentaires et l'assistant IA.

### Neutres

- Pas de pre-commit hooks. La CI reste le seul garde-fou automatisé.
- Pas de cache distribué pour le rate limiting (Redis suffit à cette échelle).

## Alternatives écartées

- **Extension Prisma pour RLS** : impossible de garantir le contexte par connexion.
- **Refresh tokens en Redis** : perdus au redémarrage sans AOF.
- **JWT de refresh** : non révocables.
- **Authentification stateless sans refresh** : access token trop long pour la
  sécurité, ou déconnexion forcée toutes les 15 min.
- **Middleware global de transaction** : bloquerait une connexion pendant les
  appels externes (LLM, MinIO).
- **Comparaison de rôles dans les routes** : duplication à chaque nouvelle
  route, oubli garanti.

## Références

- ADR-0001 (monorepo et infra Docker)
- ADR-0002 (outillage qualité et CI)
- ADR-0003 (schéma DB, embeddings, RLS)
- <https://nodejs.org/api/async_context.html>
- <https://www.postgresql.org/docs/current/sql-set.html>
- <https://datatracker.ietf.org/doc/html/rfc7519>
- <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>
