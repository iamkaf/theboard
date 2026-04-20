<p align="center">
  <img src="assets/banner.png" alt="theboard banner" width="480" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-a78bfa?style=for-the-badge&labelColor=1a1a2e" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522-5eead4?style=for-the-badge&logo=node.js&logoColor=5eead4&labelColor=1a1a2e" alt="Node 22+" />
  <a href="https://www.npmjs.com/package/theboard"><img src="https://img.shields.io/npm/v/theboard?style=for-the-badge&color=fbbf24&logo=npm&logoColor=fbbf24&labelColor=1a1a2e" alt="npm" /></a>
</p>

<h1 align="center">theboard</h1>

<p align="center">
  <strong>A zero-dependency CLI for interacting with The Board from your terminal.</strong>
</p>

---

Theboard provides browser-based login and manages card and board flows directly from the command line without heavy third-party dependencies.

## Quick Start

### Install

```bash
npm install -g theboard
```

*(You can also use `npx theboard` to run without installing globally.)*

### Authenticate

```bash
theboard login
```

This opens `board.kaf.sh` in your browser, asks you to approve CLI access, and securely stores the token locally.

## Usage

### Authentication & Config

| Command | Description |
|---------|-------------|
| `theboard login` | Authenticate via browser |
| `theboard logout` | Remove the local CLI token |
| `theboard auth status` | Check current authentication status |
| `theboard auth set-token <token>` | Manually configure a Personal Access Token (PAT) |
| `theboard auth set-base-url <url>` | Point the CLI at a different API base URL |
| `theboard info` | View API information |

The CLI stores local config in `~/.config/theboard/config.json`. You can override these using environment variables:

- `THEBOARD_TOKEN`
- `THEBOARD_BASE_URL`

### Boards

| Command | Description |
|---------|-------------|
| `theboard boards list` | List available boards (use `--json` for scripting) |
| `theboard boards get <board-id>` | Get details for a specific board |

### Cards

Cards can be targeted by internal ID (`crd_...`) or public code (`BRD-29`).

| Command | Description |
|---------|-------------|
| `theboard cards get <board-id> <card-id>` | View card details |
| `theboard cards create <board-id> --list <list-id> --title <text> [options]` | Create a new card |
| `theboard cards update <board-id> <card-id> [options]` | Update an existing card |
| `theboard cards move <board-id> <card-id> --list <list-id> --index <num>` | Move a card to a different list |
| `theboard cards comment <board-id> <card-id> --message <text>` | Add a comment to a card |

**Card Options:**

| Option | Actions | Description |
|--------|---------|-------------|
| Title | `--title <text>` | Set the card title |
| Description | `--description <text>` | Set the card description |
| Label | `--label <id>`, `--clear-labels` | Modify or clear labels |
| Assignee | `--assignee <id>`, `--clear-assignee` | Modify or clear assignee |
| Epic | `--epic <id>`, `--clear-epic` | Modify or clear epic |
| Due Date | `--due-at <iso-or-ms>`, `--clear-due-at` | Modify or clear due date |

## Development

```bash
npm install
npm run build
npm test
```

## License

[MIT](LICENSE)
