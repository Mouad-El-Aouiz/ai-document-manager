# ADR-0011 — Worker de maintenance

- **Statut :** Accepté
- **Date :** 2026-11-16
- **Portée :** Phase 2 (gestion documentaire)

## Contexte

Trois tâches récurrentes doivent tourner en arrière-plan :

1. Nettoyer les uploads `PENDING_UPLOAD` abandonnés (> 24h).
2. Purger définitivement les éléments soft-deleted (> 30 jours).
3. Purger les versions au-delà de la rétention par plan.

## Décision

### 1. Worker connecté en superuser

- Le worker utilise `DATABASE_URL_MIGRATE` (rôle `aidm`).
- **Pourquoi :** il doit (a) lister les organisations, (b) supprimer des `DocumentVersion` (que `aidm_app` ne peut pas supprimer par `REVOKE`), (c) hard-delete des `Document` et `Folder`.
- **Alternative rejetée :** multiplier les rôles non-superuser + fonctions `SECURITY DEFINER` pour chaque opération. Complexité disproportionnée pour un projet solo.

### 2. `withTenant` réutilisé

- Le worker utilise `withTenant(orgId, fn)` pour chaque opération par organisation.
- **Pourquoi :** cohérence avec l'API, et future migration vers un rôle non-superuser sans changement de code.

### 3. Ordre S3 → DB

- On supprime l'objet S3 **avant** la ligne en base.
- Si le job échoue entre les deux, une relance trouve la ligne encore en base → retry.
- Si la suppression S3 échoue, la ligne reste (pas de perte silencieuse).

### 4. Idempotence

- Tous les jobs sont idempotents : relancer ne crée pas de doublons.
- `deleteMany` S3 + DB gère les cas partiels.

### 5. Ordonnancement

- `bullmq` + `repeat` (cron-like) sur la queue `maintenance`.
- `cleanup-pending-uploads` : toutes les 6h.
- `purge-deleted-items` : 1x/jour à 3h.
- `purge-old-versions` : 1x/jour à 4h.

## Conséquences

- **Positives :** maintenance automatique, pas de fuite de stockage, workers isolés de l'API.
- **Négatives :** le worker a des droits superuser (surface d'attaque si compromis). Mitigation : aucun endpoint réseau, seul Redis l'expose.
