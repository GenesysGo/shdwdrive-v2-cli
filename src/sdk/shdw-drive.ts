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

interface ShdwDriveConfig {
  endpoint: string;
}

export class ShdwDriveSDK {
  private endpoint: string;
  private wallet?: WalletAdapter;
  private keypair?: Keypair;

  constructor(
    config: ShdwDriveConfig,
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
    } = {}
  ): Promise<{ finalized_location: string }> {
    const { onProgress } = options;
    const updateProgress = (progress: number) => {
      onProgress?.({
        status: 'uploading',
        progress,
      });
    };

    try {
      if (file.size <= CHUNK_SIZE) {
        console.log('Starting regular file upload...');
        return await this.uploadSmallFile(bucket, file, updateProgress);
      } else {
        console.log('File size > 5MB, initiating multipart upload...');
        return await this.uploadLargeFile(bucket, file, updateProgress);
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
    onProgress?: (progress: number) => void
  ): Promise<{ finalized_location: string }> {
    const fileNamesHash = SHA256(file.name).toString();
    console.log('Message to sign:', `shdwDrive Signed Message:\nStorage Account: ${bucket}\nUpload file with hash: ${fileNamesHash}`);

    // Create and sign message
    const messageToSign = `shdwDrive Signed Message:\nStorage Account: ${bucket}\nUpload file with hash: ${fileNamesHash}`;
    const signature = await this.signMessage(messageToSign);
    const signer = this.getSigner();

    // Prepare form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('message', signature);
    formData.append('signer', signer);
    formData.append('storage_account', bucket);

    const response = await fetch(`${this.endpoint}/v1/object/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorMessage = 'Upload failed';
      
      try {
        if (contentType?.includes('application/json')) {
          const error = await response.json();
          errorMessage = error.error || error.message || 'Upload failed';
        } else {
          const text = await response.text();
          errorMessage = `Upload failed - Status: ${response.status}, Response: ${text.slice(0, 200)}...`;
        }
      } catch (e) {
        errorMessage = `Upload failed - Status: ${response.status}, Error parsing response`;
      }
      
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private async uploadLargeFile(
    bucket: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<{ finalized_location: string }> {
    // Initialize multipart upload
    const initMessage = `shdwDrive Signed Message:\nInitialize multipart upload\nBucket: ${bucket}\nFilename: ${file.name}\nFile size: ${file.size}`;
    const signature = await this.signMessage(initMessage);
    const signer = this.getSigner();

    const initResponse = await fetch(
      `${this.endpoint}/v1/object/multipart/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket,
          filename: file.name,
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
      formData.append('key', key);
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

  private async fileExists(bucket: string, filename: string): Promise<boolean> {
    const signer = this.getSigner();
    
    try {
      const response = await fetch(`${this.endpoint}/v1/object/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket,
          owner: signer
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.objects?.some((obj: any) => obj.key === filename) ?? false;
    } catch (e) {
      return false;
    }
  }

  async deleteFile(bucket: string, fileUrl: string): Promise<{ message: string; success: boolean }> {
    // Extract filename from URL if full URL is provided
    let filename = fileUrl;
    try {
      const url = new URL(fileUrl);
      const parts = url.pathname.split('/');
      const bucketIndex = parts.findIndex(part => part === bucket);
      if (bucketIndex !== -1 && parts.length > bucketIndex + 1) {
        filename = parts.slice(bucketIndex + 1).join('/');
      }
    } catch (e) {
      // If not a URL, assume it's already a filename
      console.log('Using provided filename:', filename);
    }

    // Check if file exists first
    const exists = await this.fileExists(bucket, filename);
    if (!exists) {
      return {
        message: 'File does not exist or has already been deleted',
        success: false
      };
    }

    console.log('Using filename for deletion:', filename);

    // Create message with exact formatting
    const message = `shdwDrive Signed Message:
Delete file
Bucket: ${bucket}
Filename: ${filename}`;

    console.log('Signing delete message:', message);
    const signature = await this.signMessage(message);
    const signer = this.getSigner();

    const response = await fetch(`${this.endpoint}/v1/object/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket,
        filename,
        message: signature,
        signer,
      }),
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      throw new Error('Failed to parse server response');
    }

    if (!response.ok) {
      throw new Error(responseData.error || 'Delete failed');
    }

    // For successful deletions
    return {
      message: responseData.message || 'File deleted successfully',
      success: true
    };
  }
}