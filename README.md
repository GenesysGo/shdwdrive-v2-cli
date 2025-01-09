<p align="center">
  <a href="https://shdwdrive.com">
    <img src="./assets/shdwdrive_Logo.png" alt="ShdwDrive Logo" width="600"/>
  </a>
</p>

# shdwDrive CLI

A command-line interface for interacting with shdwDrive storage.

## Features

- 📤 File uploads (supports both small and large files)
- 📥 File deletion
- 📋 File listing
- 📊 Bucket usage statistics
- 🔐 Secure message signing
- 🔄 Multipart upload support for large files

## Installation

You can install the CLI globally using npm:

```bash
npm install -g @shdwdrive/cli
```

Or use it directly from the repository:

```bash
git clone https://github.com/genesysgo/shdwdrive-v2-cli.git
cd shdwdrive-v2-cli
npm install
npm run build
npm link
```

## Configuration

The CLI uses environment variables for configuration:

- `SHDW_ENDPOINT`: The shdwDrive API endpoint (defaults to https://v2.shdwdrive.com)

## Usage

### Upload a file

```bash
shdw-drive upload \
  --keypair ~/.config/solana/id.json \
  --bucket your-bucket-identifier \
  --file path/to/your/file.txt \
  --directory optional/directory/path
```

### Delete a file

```bash
shdw-drive delete \
  --keypair ~/.config/solana/id.json \
  --bucket your-bucket-identifier \
  --file file-url-or-path
```

### List files in a bucket

```bash
shdw-drive list \
  --keypair ~/.config/solana/id.json \
  --bucket your-bucket-identifier
```

### Check bucket storage usage

```bash
shdw-drive usage \
  --keypair ~/.config/solana/id.json \
  --bucket your-bucket-identifier
```

## Development

1. Clone the repository:
```bash
git clone https://github.com/genesysgo/shdwdrive-v2-cli.git
```

2. Install dependencies:
```bash
cd shdwdrive-v2-cli
npm install
```

3. Build the project:
```bash
npm run build
```

4. Link the CLI locally:
```bash
npm link
```

## License

See the LICENSE file for details.