#!/usr/bin/env node
import { Command } from 'commander';
import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { ShdwDriveSDK } from '@shdw-drive/sdk';

const program = new Command();

program
  .name('shdw-drive')
  .description('CLI tool for Shadow Drive file operations')
  .version('1.0.0');

  program
  .command('upload')
  .description('Upload a file to Shadow Drive')
  .requiredOption('-k, --keypair <path>', 'Path to keypair file')
  .requiredOption('-b, --bucket <bucket>', 'Bucket identifier')
  .requiredOption('-f, --file <path>', 'Path to file to upload')
  .action(async (options) => {
    try {
      // Load keypair
      const keypairData = JSON.parse(readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

      // Initialize SDK with more verbose logging
      console.log('Initializing SDK with keypair:', keypair.publicKey.toString());
      
      const sdk = new ShdwDriveSDK(
        { endpoint: process.env.SHDW_ENDPOINT || 'https://v2.shdwdrive.com' },
        { keypair }
      );

      // Read file and create File object
      const fileBuffer = readFileSync(options.file);
      const fileName = options.file.split('/').pop()!;
      const file = new File([fileBuffer], fileName);
      
      console.log('Starting upload...');
      console.log('Bucket:', options.bucket);
      console.log('File:', fileName);
      
      const result = await sdk.uploadFile(options.bucket, file, {
        onProgress: (progress) => {
          process.stdout.write(`Upload progress: ${progress.progress.toFixed(2)}%\r`);
        },
      });

      console.log('\nUpload complete!');
      console.log('File location:', result.finalized_location);
    } catch (error) {
      console.error('Error uploading file:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('delete')
  .description('Delete a file from Shadow Drive')
  .requiredOption('-k, --keypair <path>', 'Path to keypair file')
  .requiredOption('-b, --bucket <bucket>', 'Bucket identifier')
  .requiredOption('-f, --file <url>', 'File URL or path to delete')
  .action(async (options) => {
    try {
      // Load keypair
      const keypairData = JSON.parse(readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

      // Initialize SDK
      const sdk = new ShdwDriveSDK(
        { endpoint: process.env.SHDW_ENDPOINT || 'https://v2.shdwdrive.com' },
        { keypair }
      );

      console.log('Attempting to delete file...');
      console.log('Bucket:', options.bucket);
      console.log('File URL:', options.file);
      
      const result = await sdk.deleteFile(options.bucket, options.file);

      if (result.success) {
        console.log('\nDelete operation successful');
        console.log('Server response:', result.message);
      } else {
        console.log('\nDelete operation failed');
        console.log('Reason:', result.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      process.exit(1);
    }
  });

  program
  .command('list')
  .description('List all files in a Shadow Drive bucket')
  .requiredOption('-k, --keypair <path>', 'Path to keypair file')
  .requiredOption('-b, --bucket <bucket>', 'Bucket identifier')
  .action(async (options) => {
    try {
      // Load keypair
      const keypairData = JSON.parse(readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

      // Initialize SDK
      const sdk = new ShdwDriveSDK(
        { endpoint: process.env.SHDW_ENDPOINT || 'https://v2.shdwdrive.com' },
        { keypair }
      );

      console.log('Fetching files from bucket:', options.bucket);
      const files = await sdk.listFiles(options.bucket);

      console.log('\nFiles in bucket:');
      if (files.length === 0) {
        console.log('No files found');
      } else {
        files.forEach(file => {
          const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
          console.log(`- ${file.key}`);
          console.log(`  Size: ${sizeInMB} MB`);
          console.log(`  Last Modified: ${new Date(file.lastModified).toLocaleString()}`);
          console.log('');
        });
      }
    } catch (error) {
      console.error('Error listing files:', error);
      process.exit(1);
    }
  program
  .command('usage')
  .description('Get storage usage for a Shadow Drive bucket')
  .requiredOption('-k, --keypair <path>', 'Path to keypair file')
  .requiredOption('-b, --bucket <bucket>', 'Bucket identifier')
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

      const sdk = new ShdwDriveSDK(
        { endpoint: process.env.SHDW_ENDPOINT || 'https://v2.shdwdrive.com' },
        { keypair }
      );

      const usage = await sdk.getBucketUsage(options.bucket);

      console.log('\nBucket Usage:');
      console.log(`Bucket: ${usage.bucket}`);
      const usedMB = (usage.storage_used / (1024 * 1024)).toFixed(2);
      console.log(`Storage Used: ${usedMB} MB`);

      if (usage.storage_used > 1024 * 1024 * 1024) {
        const usedGB = (usage.storage_used / (1024 * 1024 * 1024)).toFixed(2);
        console.log(`Storage Used: ${usedGB} GB`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error getting bucket usage:', errorMessage);
      process.exit(1);
    }
  });

  });

program.parse();