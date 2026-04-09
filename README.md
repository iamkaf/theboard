# theboard

`theboard` is an npm CLI for interacting with [The Board](https://board.kaf.sh) over its JSON API.

It stores local config in `~/.config/theboard/config.json` and supports browser-based login plus the most common board and card flows from the terminal.

## Features

- Zero runtime dependencies
- Uses modern Node built-ins: `fetch`, `util.parseArgs`, and `node:test`
- Browser-based CLI login
- Works with The Board PATs under the hood
- Supports card routes by either internal card ID or public card code like `BRD-54`
- Text output for humans and `--json` output for scripting

## Install

```bash
npm install -g theboard
```

Or run it without installing globally:

```bash
npx theboard --help
```

## Authenticate

Preferred flow:

```bash
theboard login
```

This will:

1. Open `board.kaf.sh` in your browser
2. Ask you to approve CLI access
3. Store the resulting CLI token locally

Remove the local CLI token:

```bash
theboard logout
```

Optional: point the CLI at a different API base URL:

```bash
theboard auth set-base-url https://board.kaf.sh/api
```

You can also use environment variables instead of stored config:

```bash
export THEBOARD_TOKEN="brd_pat_your_token_here"
export THEBOARD_BASE_URL="https://board.kaf.sh/api"
```

### Manual fallback

If you already have a PAT and want to configure it directly:

```bash
theboard auth set-token brd_pat_your_token_here
```

## Commands

### API info

```bash
theboard info
```

### Auth status

```bash
theboard auth status
```

### Browser login

```bash
theboard login
theboard logout
```

### List boards

```bash
theboard boards list
theboard --json boards list
```

### Get a board

```bash
theboard boards get brd_ceffb1e353204f8c90c7df689c823e53
```

### Get a card

Either form works:

```bash
theboard cards get brd_ceffb1e353204f8c90c7df689c823e53 crd_460ef1144a5d451dbe30d56353bef301
theboard cards get brd_ceffb1e353204f8c90c7df689c823e53 BRD-29
```

### Create a card

```bash
theboard cards create brd_ceffb1e353204f8c90c7df689c823e53 \
  --list lst_7830ab37c63a4e8584666a5488981cb3 \
  --title "Ship CLI" \
  --description "Created from the terminal"
```

### Update a card

```bash
theboard cards update brd_ceffb1e353204f8c90c7df689c823e53 BRD-29 \
  --title "Replace the description editor with a proper editor"
```

Optional update fields:

- `--description <text>`
- `--label <label-id>` and `--clear-labels`
- `--assignee <user-id>` and `--clear-assignee`
- `--due-at <iso-or-ms>` and `--clear-due-at`

### Move a card

```bash
theboard cards move brd_ceffb1e353204f8c90c7df689c823e53 BRD-29 \
  --list lst_af4a07d59a31478d8dd45e09dc8d6708 \
  --index 0
```

### Comment on a card

```bash
theboard cards comment brd_ceffb1e353204f8c90c7df689c823e53 BRD-29 \
  --message "Done via CLI"
```

## Development

```bash
npm install
npm run build
npm test
```
