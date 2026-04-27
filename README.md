<p align="center">
  <img src="assets/banner.png" alt="board banner" width="480" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-a78bfa?style=for-the-badge&labelColor=1a1a2e" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522-5eead4?style=for-the-badge&logo=node.js&logoColor=5eead4&labelColor=1a1a2e" alt="Node 22+" />
  <a href="https://www.npmjs.com/package/@iamkaf/board"><img src="https://img.shields.io/npm/v/%40iamkaf%2Fboard?style=for-the-badge&color=fbbf24&logo=npm&logoColor=fbbf24&labelColor=1a1a2e" alt="npm" /></a>
</p>

<h1 align="center">board</h1>

<p align="center">
  <strong>A zero-dependency CLI for <a href="https://board.kaf.sh">The Board</a>.</strong>
</p>

---

`board` is the terminal client for The Board. It is built for fast board and card work: browser login, a default board, human-friendly list names, card codes, and JSON output for scripts.

## Install

```bash
npm install -g @iamkaf/board
```

You can also run it without installing:

```bash
npx @iamkaf/board --help
```

## Authenticate

```bash
board login
```

The login flow opens `board.kaf.sh` in your browser, asks you to approve CLI access, and stores a local token in `~/.config/board/config.json`.

Useful auth and config commands:

```bash
board auth status
board logout
board auth set-token brd_pat_...
board auth set-base-url https://board.kaf.sh/api
```

Environment overrides:

```bash
export BOARD_TOKEN="brd_pat_..."
export BOARD_BASE_URL="https://board.kaf.sh/api"
export BOARD_DEFAULT_BOARD="BRD"
```

## Global Options

Global options may appear before or after the command:

```bash
board --json boards list
board boards list --json
board -b BRD card list --list "To Do"
```

Supported globals:

| Option | Description |
| --- | --- |
| `--json` | Print machine-readable JSON |
| `--format json` | Equivalent to `--json` |
| `--board`, `-b` | Use a board without passing it positionally |
| `--token` | Use a token for one command |
| `--base-url` | Use a different API base URL for one command |

## Boards

`<board>` can be a board code like `BRD`, a slug like `board-823e53`, or an internal `brd_...` id.

```bash
board boards list
board board get BRD
board board use BRD
```

`board board use <board>` stores a default board so card commands can omit the board argument:

```bash
board board use BRD
board card list --list "To Do"
board card get BRD-88
```

The plural `boards` command remains available for compatibility:

```bash
board boards get BRD
```

## Lists

```bash
board lists list
board lists list BRD
board column list --json
```

List names are accepted by card create and move commands, so most workflows do not need raw `lst_...` ids.

## Cards

Cards can be targeted by public code, such as `BRD-29`, or by internal `crd_...` id.

```bash
board card list
board card list --list "Doing"
board card list BRD --label Bug --json
board card get BRD-29
board card view BRD-29
```

Create a card:

```bash
board card create \
  --list "To Do" \
  --title "Ship CLI docs" \
  --description "Created from the terminal"
```

Update a card:

```bash
board cards update BRD-29 \
  --title "Ship CLI docs" \
  --description "Updated from the terminal" \
  --due-at 2026-05-01
```

Move a card. If `--index` is omitted, the card is appended to the target list.

```bash
board card move BRD-29 --to Doing
board card move BRD-29 --list Done --index 0
```

Comment on a card:

```bash
board card comment BRD-29 --message "Done via CLI"
```

Descriptions and comments accept literal `\n` and send them as real newlines:

```bash
board card comment BRD-29 --message "First line\nSecond line"
```

The older plural `cards` commands still work for compatibility, but new docs and scripts should prefer `board card ...`.

## Development

```bash
npm install
npm run build
npm test
```

## License

[MIT](LICENSE)
