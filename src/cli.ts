#!/usr/bin/env node
import { Command } from 'commander';
import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { ShdwDriveSDK } from './sdk/shdw-drive';

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
  .option('-d, --directory <path>', 'Directory path within bucket')
  .action(async (options) => {
    try {
      // Load keypair
      const keypairData = JSON.parse(readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

      // Initialize SDK
      const sdk = new ShdwDriveSDK(
        { endpoint: process.env.SHDW_ENDPOINT || 'https://shadow-storage.genesysgo.net' },
        { keypair }
      );

      // Read file
      const file = new File([readFileSync(options.file)], options.file.split('/').pop()!);

      console.log('Starting upload...');
      const result = await sdk.uploadFile(options.bucket, file, {
        directory: options.directory,
        onProgress: (progress) => {
          process.stdout.write(`Upload progress: ${progress.progress.toFixed(2)}%\r`);
        },
      });

      console.log('\nUpload complete!');
      console.log('File location:', result.finalized_location);
    } catch (error) {
      console.error('Error uploading file:', error);
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
        { endpoint: process.env.SHDW_ENDPOINT || 'https://shadow-storage.genesysgo.net' },
        { keypair }
      );

      console.log('Deleting file...');
      const result = await sdk.deleteFile(options.bucket, options.file);

      console.log('Delete complete!');
      console.log('Message:', result.message);
    } catch (error) {
      console.error('Error deleting file:', error);
      process.exit(1);
    }
  });

program.parse();
