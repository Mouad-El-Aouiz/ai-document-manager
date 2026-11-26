import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// On étend Zod une seule fois ici.
// Tous les fichiers qui ont besoin de `.openapi()` doivent importer `z` depuis ce fichier.
extendZodWithOpenApi(z);

export { z };
