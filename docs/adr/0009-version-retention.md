# ADR-0009 — Rétention des versions

- **Statut :** Accepté
- **Date :** 2026-11-16
- **Portée :** Phase 2 (gestion documentaire)

## Contexte

Sans limite, un document peut accumuler un nombre illimité de versions, ce qui consomme du stockage S3 et complique l'UX.

## Décision

1. **Limite par plan** : chaque `OrganizationPlan` a une limite de versions par document, configurable par env :
   - `FREE` : `RETENTION_FREE_VERSIONS` (défaut 3)
   - `PRO` : `RETENTION_PRO_VERSIONS` (défaut 10)
   - `ENTERPRISE` : `RETENTION_ENTERPRISE_VERSIONS` (défaut 50)
2. **Pas de purge synchrone** : la création de versions n'est **pas** bloquée par la limite. C'est le job 5.10 qui purge les plus anciennes (S3 + base) une fois par jour.
3. **Restauration** : une restauration crée toujours une **nouvelle** version (copie physique S3), jamais une réutilisation d'ID. L'historique reste intact jusqu'à la purge.

## Conséquences

- **Positives** : stockage borné, UX claire, pas de suppression surprise pendant une session.
- **Négatives** : fenêtre de dépassement entre deux exécutions du job (max 24h). Acceptable en Solo SaaS.
