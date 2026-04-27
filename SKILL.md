---
name: board-cli
description: Use when you need to work with The Board from a terminal through the board CLI, including login, listing boards, listing cards, fetching cards, creating cards, moving cards, updating cards, and posting comments.
---

# board CLI

Use this skill when the task is about interacting with The Board from a shell or script.

Prefer the `board` CLI over raw `curl` when it covers the task. Use `--json` for scripted output.

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

Direct config:

```bash
board auth status
board auth set-token brd_pat_...
board auth set-base-url https://board.kaf.sh/api
```

## Board Targeting

`<board>` accepts a board code, slug, or internal `brd_...` id.

Prefer setting a default board when doing repeated work:

```bash
board board use BRD
```

After that, card commands can usually omit the board argument:

```bash
board card list --list "To Do"
board card get BRD-29
```

You can also pass the board explicitly:

```bash
board -b BRD card list --json
board card list BRD --list Doing
```

## Common Commands

List boards:

```bash
board boards list
board boards list --json
```

Get a board:

```bash
board board get BRD
board board create --name "New Board" --code NEW
board board update BRD --name "Renamed Board"
```

List lists:

```bash
board lists list BRD
board column list --json
board list create --title Review
board list setup --preset planning
```

Labels and epics:

```bash
board label list
board label create --text Bug --color red
board epic list
board epic create --name Alpha --color blue --status active
```

List cards:

```bash
board card list BRD
board card list --list "Doing"
board card list --label Bug --json
```

Get a card:

```bash
board card get BRD-29
board card view BRD-29
board card activity BRD-29
board card comments BRD-29
```

Create a card:

```bash
board card create \
  --list "To Do" \
  --title "Ship CLI" \
  --description "Created from the terminal"
```

Update a card:

```bash
board card update BRD-29 \
  --title "Ship CLI" \
  --description "Updated from the terminal"
```

Move a card:

```bash
board card move BRD-29 --to Doing
board card move BRD-29 --list Done --index 0
```

If `--index` is omitted, move appends to the target list.

Comment on a card:

```bash
board card comment BRD-29 --message "Done via CLI"
```

Card lifecycle:

```bash
board card reorder --list Doing --cards BRD-29,BRD-30
board card link BRD-29 --target BRD-30 --relation relates_to
board card templates
board card archive BRD-29 --force
```

Literal `\n` in descriptions and comments is sent as an actual newline.

## Notes

- Card routes accept either public card codes like `BRD-29` or internal `crd_...` ids.
- List arguments accept titles like `Doing` or internal `lst_...` ids.
- The Board base API URL is `https://board.kaf.sh/api`.
- Prefer singular commands (`board card ...`, `board board ...`) in new scripts. Plural commands remain for compatibility.
