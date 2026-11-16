import type { StorageProvider, PresignUploadParams, HeadObjectResult } from './types.js';

interface FakeObject {
  body: string;
  contentType: string;
}

export class FakeStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, FakeObject>();

  presignUpload(params: PresignUploadParams): Promise<string> {
    // Simulation : on enregistre immédiatement l'objet pour que headObject le trouve.
    // Le contenu est un placeholder de la taille attendue.
    this.objects.set(params.key, {
      body: 'x'.repeat(params.contentLength),
      contentType: params.contentType,
    });
    return Promise.resolve(`http://fake-s3/${params.key}`);
  }

  presignDownload(key: string, _filename: string): Promise<string> {
    return Promise.resolve(`http://fake-s3/${key}`);
  }

  headObject(key: string): Promise<HeadObjectResult | null> {
    const obj = this.objects.get(key);
    if (!obj) return Promise.resolve(null);
    return Promise.resolve({ size: obj.body.length, contentType: obj.contentType });
  }

  copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    const obj = this.objects.get(sourceKey);
    if (!obj) return Promise.reject(new Error(`Source key ${sourceKey} not found`));
    this.objects.set(destinationKey, { ...obj });
    return Promise.resolve();
  }

  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
    return Promise.resolve();
  }

  // Utilitaire pour les tests (non présent dans l'interface)
  _set(key: string, body: string, contentType: string): void {
    this.objects.set(key, { body, contentType });
  }
}
