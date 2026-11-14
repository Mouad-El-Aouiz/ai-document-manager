export interface PresignUploadParams {
  key: string;
  contentType: string;
  contentLength: number;
  checksumSha256?: string;
}

export interface HeadObjectResult {
  size: number;
  contentType?: string;
  checksumSha256?: string;
}

export interface StorageProvider {
  presignUpload(params: PresignUploadParams): Promise<string>;
  presignDownload(key: string, filename: string): Promise<string>;
  headObject(key: string): Promise<HeadObjectResult | null>;
  copyObject(sourceKey: string, destinationKey: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
}
