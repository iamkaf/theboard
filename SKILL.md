---
name: theboard-cli
description: Use when you need to work with The Board from a terminal through the theboard CLI, including login, listing boards, fetching cards, creating cards, moving cards, and posting comments.
---

# theboard CLI

Use this skill when the task is about interacting with The Board from a shell or script.

Prefer the CLI over raw `curl` when it covers the task. Use `--json` for scripted output.

## Authentication

Preferred flow:

```bash
theboard login
```

Manual fallback:

```bash
export THEBOARD_TOKEN="brd_pat_..."
export THEBOARD_BASE_URL="https://board.kaf.sh/api"
```

## Common Commands

List boards:

```bash
theboard boards list
theboard --json boards list
```

Get a board:

```bash
theboard boards get <boardId>
```

Get a card:

```bash
theboard cards get <boardId> BRD-29
```

Create a card:

```bash
theboard cards create <boardId> \
  --list <listId> \
  --title "Ship CLI" \
  --description "Created from the terminal"
```

Move a card:

```bash
theboard cards move <boardId> BRD-29 \
  --list <listId> \
  --index 0
```

Comment on a card:

```bash
theboard cards comment <boardId> BRD-29 \
  --message "Done via CLI"
```

## Notes

- Card routes accept either the internal `crd_...` id or the public card code like `BRD-29`.
- The Board base API URL is `https://board.kaf.sh/api`.
- Descriptions and comments are markdown strings.
