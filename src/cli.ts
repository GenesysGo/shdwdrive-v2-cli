#!/usr/bin/env node

process.emitWarning = (warning, type) => {
  const warningText = warning instanceof Error ? warning.message : String(warning);
  if (type === 'DeprecationWarning' && warningText.includes('punycode')) {
    return;
  }
  console.warn(warning);
};

import { Command } from 'commander';
import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { ShdwDriveSDK, FileUploadProgress } from '@shdwdrive/sdk';
import chalk from 'chalk';
import path from 'path';

const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
);

const program = new Command();

program
  .name('shdw-drive')
  .description('CLI tool for Shadow Drive file operations')
  .version(packageJson.version);

  program
  .command('upload')
  .description('Upload a file to Shadow Drive')
  .requiredOption('-k, --keypair <path>', 'Path to keypair file')
  .requiredOption('-b, --bucket <bucket>', 'Bucket identifier')
  .requiredOption('-f, --file <path>', 'Path to file to upload')
  .option('-F, --folder <path>', 'Optional folder path within bucket')
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

      // Read file and create File object
      const fileBuffer = readFileSync(options.file);
      const fileName = options.file.split('/').pop()!;
      const file = new File([fileBuffer], fileName);
      
      // Clean up folder path if provided (using the same logic as SDK)
      const directory = options.folder 
        ? options.folder.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/')
        : '';
      
      console.log(chalk.cyan('\nStarting upload...'));
      console.log(chalk.dim('Bucket:'), chalk.yellow(options.bucket));
      console.log(chalk.dim('File:'), chalk.yellow(fileName));
      if (directory) {
        console.log(chalk.dim('Folder:'), chalk.yellow(directory));
      }
      
      const result = await sdk.uploadFile(options.bucket, file, {
        directory,
        onProgress: (progress: FileUploadProgress) => {
          if (progress.status === 'error') {
            process.stdout.write(chalk.red('\nUpload encountered an error\n'));
          } else {
            process.stdout.write(chalk.blue(`Upload progress: ${progress.progress.toFixed(2)}%\r`));
          }
        },
      });

      console.log(chalk.green('\n✓ Upload complete!'));
      console.log(chalk.dim('File location:'), chalk.cyan(result.finalized_location));
    } catch (error) {
      console.error(chalk.red('Error uploading file:'), error);
      if (error instanceof Error) {
        console.error(chalk.red('Error details:'), error.message);
        console.error(chalk.dim('Stack trace:'), error.stack);
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

      console.log(chalk.cyan('\nAttempting to delete file...'));
      console.log(chalk.dim('Bucket:'), chalk.yellow(options.bucket));
      console.log(chalk.dim('File URL:'), chalk.yellow(options.file));
      
      const result = await sdk.deleteFile(options.bucket, options.file);

      if (result.success) {
        console.log(chalk.green('\n✓ Delete operation successful'));
        console.log(chalk.dim('Server response:'), chalk.cyan(result.message));
      } else {
        console.log(chalk.red('\n✗ Delete operation failed'));
        console.log(chalk.dim('Reason:'), chalk.red(result.message));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error deleting file:'), error);
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

      console.log(chalk.cyan('\nFetching files from bucket:'), chalk.yellow(options.bucket));
      const files = await sdk.listFiles(options.bucket);

      console.log(chalk.bold('\nFiles in bucket:'));
      if (files.length === 0) {
        console.log(chalk.red('No files found'));
      } else {
        files.forEach(file => {
          const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
          console.log(chalk.green(`- ${file.key}`));
          console.log(chalk.dim(`  Size: ${sizeInMB} MB`));
          console.log(chalk.dim(`  Last Modified: ${new Date(file.lastModified).toLocaleString()}`));
          console.log('');
        });
      }
    } catch (error) {
      console.error(chalk.red('Error listing files:'), error);
      process.exit(1);
    }
  });

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

      console.log(chalk.cyan('\nBucket Usage:'));
      console.log(chalk.dim('Bucket:'), chalk.yellow(usage.bucket));
      
      const usedMB = (usage.storage_used / (1024 * 1024)).toFixed(2);
      console.log(chalk.dim('Storage Used:'), chalk.green(`${usedMB} MB`));

      if (usage.storage_used > 1024 * 1024 * 1024) {
        const usedGB = (usage.storage_used / (1024 * 1024 * 1024)).toFixed(2);
        console.log(chalk.dim('Storage Used:'), chalk.green(`${usedGB} GB`));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error(chalk.red('Error getting bucket usage:'), errorMessage);
      process.exit(1);
    }
  });

  program
  .command('create-folder')
  .description('Create a new folder in a Shadow Drive bucket')
  .requiredOption('-k, --keypair <path>', 'Path to keypair file')
  .requiredOption('-b, --bucket <bucket>', 'Bucket identifier')
  .requiredOption('-n, --name <name>', 'Folder name')
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

      const sdk = new ShdwDriveSDK(
        { endpoint: process.env.SHDW_ENDPOINT || 'https://v2.shdwdrive.com' },
        { keypair }
      );

      console.log(chalk.cyan('\nCreating folder...'));
      console.log(chalk.dim('Bucket:'), chalk.yellow(options.bucket));
      console.log(chalk.dim('Folder name:'), chalk.yellow(options.name));

      const result = await sdk.createFolder(options.bucket, options.name);

      console.log(chalk.green('\n✓ Folder created successfully'));
      console.log(chalk.dim('Response:'), chalk.cyan(JSON.stringify(result, null, 2)));
    } catch (error) {
      console.error(chalk.red('Error creating folder:'), error);
      process.exit(1);
    }
  });

  program
  .command('delete-folder')
  .description('Delete a folder from Shadow Drive bucket')
  .requiredOption('-k, --keypair <path>', 'Path to keypair file')
  .requiredOption('-b, --bucket <bucket>', 'Bucket identifier')
  .requiredOption('-p, --path <path>', 'Folder path to delete')
  .action(async (options) => {
    try {
      const keypairData = JSON.parse(readFileSync(options.keypair, 'utf-8'));
      const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

      const sdk = new ShdwDriveSDK(
        { endpoint: process.env.SHDW_ENDPOINT || 'https://v2.shdwdrive.com' },
        { keypair }
      );

      console.log(chalk.cyan('\nDeleting folder...'));
      console.log(chalk.dim('Bucket:'), chalk.yellow(options.bucket));
      console.log(chalk.dim('Folder path:'), chalk.yellow(options.path));

      const result = await sdk.deleteFolder(options.bucket, options.path);

      console.log(chalk.green('\n✓ Folder deleted successfully'));
      console.log(chalk.dim('Response:'), chalk.cyan(JSON.stringify(result, null, 2)));
    } catch (error) {
      console.error(chalk.red('Error deleting folder:'), error);
      process.exit(1);
    }
  });

program.parse();