export interface ShdwDriveConfig {
    endpoint: string;
  }
  
  export interface WalletAdapter {
    publicKey: string;
    signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  }
  
  export interface FileUploadProgress {
    status: 'uploading' | 'complete' | 'error';
    progress: number;
  }
  
  export interface FileUploadOptions {
    onProgress?: (progress: FileUploadProgress) => void;
    directory?: string;
  }
  
  export interface UploadResponse {
    finalized_location: string;
    message?: string;
    upload_errors?: Array<{
      file: string;
      storage_account: string;
      error: string;
    }>;
  }
  
  export interface DeleteResponse {
    message: string;
  }
  
  export interface MultipartUploadPart {
    ETag: string;
    PartNumber: number;
  }
  
  export interface MultipartInitResponse {
    uploadId: string;
    key: string;
  }
  
  export interface MultipartCompleteResponse {
    finalized_location: string;
  }