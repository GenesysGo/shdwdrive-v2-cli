# shdwDrive CLI

A command-line interface for interacting with shdwDrive storage.

## Installation

You can install the CLI globally using npm:

```bash
npm install -g shdw-drive-cli
```

Or use it directly from the repository:

```bash
git clone https://github.com/yourusername/shdw-drive-cli.git
cd shdw-drive-cli
npm install
npm run build
npm link
```

## Configuration

The CLI uses environment variables for configuration:

- `SHDW_ENDPOINT`: The shdwDrive API endpoint (defaults to https://v2.shdwdrive.com/v1)

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

## Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/shdw-drive-cli.git
```

2. Install dependencies:
```bash
cd shdw-drive-cli
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

MIT
