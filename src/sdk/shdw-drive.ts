import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes';
import { SHA256 } from 'crypto-js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks as per server requirements

interface WalletAdapter {
  publicKey: string;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

interface FileUploadProgress {
  status: 'uploading' | 'complete' | 'error';
  progress: number;
}

interface ShadowDriveConfig {
  endpoint: string;
}

export class ShadowDriveSDK {
  private endpoint: string;
  private wallet?: WalletAdapter;
  private keypair?: Keypair;

  constructor(
    config: ShadowDriveConfig,
    auth: { wallet: WalletAdapter } | { keypair: Keypair }
  ) {
    this.endpoint = config.endpoint;
    if ('wallet' in auth) {
      this.wallet = auth.wallet;
    } else {
      this.keypair = auth.keypair;
    }
  }

  private async signMessage(message: string): Promise<string> {
    const messageBuffer = Buffer.from(message);
    let signature: Uint8Array;

    if (this.wallet?.signMessage) {
      signature = await this.wallet.signMessage(messageBuffer);
    } else if (this.keypair) {
      signature = nacl.sign.detached(messageBuffer, this.keypair.secretKey);
    } else {
      throw new Error('No signing method available');
    }

    return bs58.encode(signature);
  }

  private getSigner(): string {
    if (this.wallet?.publicKey) {
      return this.wallet.publicKey;
    } else if (this.keypair) {
      return this.keypair.publicKey.toString();
    }
    throw new Error('No signer available');
  }

  async uploadFile(
    bucket: string,
    file: File,
    options: {
      onProgress?: (progress: FileUploadProgress) => void;
      directory?: string;
    } = {}
  ): Promise<{ finalized_location: string }> {
    const { onProgress, directory = '' } = options;
    const updateProgress = (progress: number) => {
      onProgress?.({
        status: 'uploading',
        progress,
      });
    };

    try {
      if (file.size <= 5 * 1024 * 1024) {
        return await this.uploadSmallFile(bucket, file, directory, updateProgress);
      } else {
        return await this.uploadLargeFile(bucket, file, directory, updateProgress);
      }
    } catch (error) {
      onProgress?.({
        status: 'error',
        progress: 0,
      });
      throw error;
    }
  }

  private async uploadSmallFile(
    bucket: string,
    file: File,
    directory: string,
    onProgress?: (progress: number) => void
  ): Promise<{ finalized_location: string }> {
    // Create hash of filename for message signing
    const fileNamesHash = SHA256(file.name).toString();

    // Create and sign message
    const messageToSign = `Shadow Drive Signed Message:
Storage Account: ${bucket}
Upload file with hash: ${fileNamesHash}`;

    const signature = await this.signMessage(messageToSign);
    const signer = this.getSigner();

    // Prepare form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('message', signature);
    formData.append('signer', signer);
    formData.append('storage_account', bucket);
    formData.append('directory', directory);

    const response = await fetch(`${this.endpoint}/v1/object/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  }

  private async uploadLargeFile(
    bucket: string,
    file: File,
    directory: string,
    onProgress?: (progress: number) => void
  ): Promise<{ finalized_location: string }> {
    // Initialize multipart upload
    const initMessage = `Shadow Drive Signed Message:
Initialize multipart upload
Bucket: ${bucket}
Filename: ${directory}${file.name}
File size: ${file.size}`;

    const signature = await this.signMessage(initMessage);
    const signer = this.getSigner();

    const initResponse = await fetch(
      `${this.endpoint}/v1/object/multipart/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket,
          filename: `${directory}${file.name}`,
          message: signature,
          signer,
          size: file.size,
          file_type: file.type,
        }),
      }
    );

    if (!initResponse.ok) {
      const error = await initResponse.json();
      throw new Error(error.error || 'Failed to initialize multipart upload');
    }

    const { uploadId, key } = await initResponse.json();
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    const uploadedParts: { ETag: string; PartNumber: number }[] = [];

    // Upload each part
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append('file', new Blob([chunk]), file.name);
      formData.append('bucket', bucket);
      formData.append('uploadId', uploadId);
      formData.append('partNumber', partNumber.toString());
      formData.append('key', `${directory}${file.name}`);
      formData.append('signer', signer);

      const response = await fetch(
        `${this.endpoint}/v1/object/multipart/upload-part`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to upload part ${partNumber}`);
      }

      const { ETag } = await response.json();
      uploadedParts.push({ ETag, PartNumber: partNumber });

      if (onProgress) {
        onProgress((partNumber / totalParts) * 90); // Save 10% for completion
      }
    }

    // Complete multipart upload
    const completeResponse = await fetch(
      `${this.endpoint}/v1/object/multipart/complete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket,
          uploadId,
          key,
          parts: uploadedParts,
          signer,
        }),
      }
    );

    if (!completeResponse.ok) {
      const error = await completeResponse.json();
      throw new Error(error.error || 'Failed to complete multipart upload');
    }

    onProgress?.(100);
    return completeResponse.json();
  }

  async deleteFile(bucket: string, fileUrl: string): Promise<{ message: string }> {
    const message = `Shadow Drive Signed Message:
Delete file
Bucket: ${bucket}
Filename: ${fileUrl}`;

    const signature = await this.signMessage(message);
    const signer = this.getSigner();

    const response = await fetch(`${this.endpoint}/v1/object/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket,
        filename: fileUrl,
        message: signature,
        signer,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete file');
    }

    return response.json();
  }
}

// Usage example:
/*
// With wallet adapter
const wallet = // ... your wallet adapter implementation
const sdk = new ShadowDriveSDK(
  { endpoint: 'https://shadow-storage.example.com' },
  { wallet }
);

// With keypair
const keypair = Keypair.generate(); // or load your keypair
const sdk = new ShadowDriveSDK(
  { endpoint: 'https://shadow-storage.example.com' },
  { keypair }
);

// Upload a file
const result = await sdk.uploadFile('your-bucket', file, {
  onProgress: (progress) => console.log(`Upload progress: ${progress.progress}%`),
  directory: 'optional/directory/path/'
});

// Delete a file
await sdk.deleteFile('your-bucket', 'file-url-or-path');
*/
