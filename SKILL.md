---
name: board-cli
description: Use when you need to work with The Board from a terminal through the board CLI, including login, listing boards, fetching cards, creating cards, moving cards, and posting comments.
---

# board CLI

Use this skill when the task is about interacting with The Board from a shell or script.

Prefer the CLI over raw `curl` when it covers the task. Use `--json` for scripted output.

## Authentication

Preferred flow:

```bash
board login
```

Manual fallback:

```bash
export BOARD_TOKEN="brd_pat_..."
export BOARD_BASE_URL="https://board.kaf.sh/api"
```

## Common Commands

List boards:

```bash
board boards list
board --json boards list
```

Get a board:

```bash
board boards get engineering-tasks-f44a88
```

`<board>` accepts either a board slug or an internal board id. Use the slug by default.

Get a card:

```bash
board cards get engineering-tasks-f44a88 BRD-29
```

Create a card:

```bash
board cards create engineering-tasks-f44a88 \
  --list <listId> \
  --title "Ship CLI" \
  --description "Created from the terminal"
```

Move a card:

```bash
board cards move engineering-tasks-f44a88 BRD-29 \
  --list <listId> \
  --index 0
```

Comment on a card:

```bash
board cards comment engineering-tasks-f44a88 BRD-29 \
  --message "Done via CLI"
```

## Notes

- Card routes remain board-scoped. The board argument accepts either a slug or an internal id, even when you know the card code.
- Card routes accept either the internal `crd_...` id or the public card code like `BRD-29`.
- The Board base API URL is `https://board.kaf.sh/api`.
- Descriptions and comments are markdown strings.
