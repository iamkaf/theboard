import { parseArgs } from "node:util";

import { BoardApiClient, BoardApiError } from "./api.js";
import {
	clearStoredToken,
	getConfigPath,
	loadAuthState,
	setStoredBaseUrl,
	setStoredDefaultBoard,
	setStoredToken,
} from "./config.js";
import { loginWithBrowser } from "./login.js";
import {
	print,
	printError,
	renderActivity,
	renderBoard,
	renderBoards,
	renderCard,
	renderCardList,
	renderLists,
	type CliIo,
	type OutputMode,
} from "./output.js";
import type { CardRecord, JsonValue, ListRecord } from "./types.js";
import { CLI_VERSION } from "./version.js";

type CommandContext = {
	io: CliIo;
	outputMode: OutputMode;
	baseUrl: string | undefined;
	token: string | undefined;
	defaultBoard: string | undefined;
};

export async function runCli(
	argv: string[],
	io: CliIo = { stdout: process.stdout, stderr: process.stderr },
) {
	try {
		const { globals, rest } = parseGlobalArgs(argv);

		if (globals.version) {
			io.stdout.write(`board ${CLI_VERSION}\n`);
			return 0;
		}

		if (globals.help || rest.length === 0) {
			io.stdout.write(`${renderHelp()}\n`);
			return 0;
		}

		const context: CommandContext = {
			io,
			outputMode: globals.json || globals.format === "json" ? "json" : "text",
			baseUrl: globals["base-url"],
			token: globals.token,
			defaultBoard: globals.board,
		};

		return await dispatch(context, rest);
	} catch (error) {
		if (error instanceof UsageError) {
			printError(io, error.message);
			return 1;
		}

		if (error instanceof BoardApiError) {
			printError(io, `API error (${error.status}): ${error.message}`);
			return 1;
		}

		printError(io, error instanceof Error ? error.message : "Unknown error");
		return 1;
	}
}

async function dispatch(context: CommandContext, args: string[]) {
	const [group, action, ...rest] = args;

	if (!group) {
		throw new UsageError(renderHelp());
	}

	if (group === "info") {
		return await handleInfo(context);
	}

	if (group === "auth") {
		return await handleAuth(context, action, rest);
	}

	if (group === "login") {
		return await handleLogin(context);
	}

	if (group === "logout") {
		return await handleLogout(context);
	}

	if (group === "boards" || group === "board") {
		return await handleBoards(context, action, rest);
	}

	if (group === "cards" || group === "card") {
		return await handleCards(context, action, rest);
	}

	if (group === "lists" || group === "list" || group === "columns" || group === "column") {
		return await handleLists(context, action, rest);
	}

	throw new UsageError(`Unknown command: ${group}\n\n${renderHelp()}`);
}

async function handleInfo(context: CommandContext) {
	const api = await createClient(context, { requireToken: false });
	const info = await api.info();
	print(context.io, info, context.outputMode);
	return 0;
}

async function handleLogin(context: CommandContext) {
	const auth = await loadAuthState(toAuthOverrides(context));

	if (!auth.baseUrl) {
		throw new UsageError("Missing base URL.");
	}

	await loginWithBrowser({
		baseUrl: auth.baseUrl,
		io: context.io,
		outputMode: context.outputMode,
	});

	return 0;
}

async function handleLogout(context: CommandContext) {
	await clearStoredToken();

	if (context.outputMode === "json") {
		print(
			context.io,
			{
				ok: true,
				configPath: getConfigPath(),
				message:
					"Local CLI token removed. Any previously issued CLI token remains active on The Board until it expires or is revoked in Settings.",
			},
			"json",
		);
	} else {
		context.io.stdout.write(
			[
				"Removed the local CLI token.",
				"Any previously issued CLI token remains active on The Board until it expires or is revoked in Settings.",
			].join("\n") + "\n",
		);
	}

	return 0;
}

async function handleAuth(context: CommandContext, action: string | undefined, args: string[]) {
	switch (action) {
		case "set-token": {
			const [token] = args;

			if (!token) {
				throw new UsageError("Usage: board auth set-token <token>");
			}

			await setStoredToken(token);
			context.io.stdout.write(`Stored token in ${getConfigPath()}\n`);
			return 0;
		}

		case "clear-token": {
			await clearStoredToken();
			context.io.stdout.write(`Cleared stored token from ${getConfigPath()}\n`);
			return 0;
		}

		case "set-base-url": {
			const [baseUrl] = args;

			if (!baseUrl) {
				throw new UsageError("Usage: board auth set-base-url <url>");
			}

			await setStoredBaseUrl(baseUrl);
			context.io.stdout.write(`Stored base URL in ${getConfigPath()}\n`);
			return 0;
		}

		case "status": {
			const auth = await loadAuthState(toAuthOverrides(context));
			const payload = {
				ok: true,
				configPath: getConfigPath(),
				baseUrl: auth.baseUrl ?? null,
				defaultBoard: auth.defaultBoard ?? null,
				hasToken: Boolean(auth.token),
			} satisfies JsonValue;

			if (context.outputMode === "json") {
				print(context.io, payload, "json");
			} else {
				context.io.stdout.write(
					`config: ${getConfigPath()}\nbaseUrl: ${auth.baseUrl ?? "unset"}\ntoken: ${
						auth.token ? "configured" : "missing"
					}\ndefaultBoard: ${auth.defaultBoard ?? "unset"}\n`,
				);
			}

			return 0;
		}

		default:
			throw new UsageError(
				[
					"Usage:",
					"  board login",
					"  board logout",
					"  board auth status",
					"  board auth set-token <token>",
					"  board auth clear-token",
					"  board auth set-base-url <url>",
				].join("\n"),
			);
	}
}

async function handleBoards(context: CommandContext, action: string | undefined, args: string[]) {
	const api = await createClient(context);

	switch (action) {
		case "list": {
			const response = await api.listBoards();

			if (context.outputMode === "json") {
				print(context.io, response, "json");
			} else {
				context.io.stdout.write(`${renderBoards(response.boards)}\n`);
			}

			return 0;
		}

		case "get": {
			const [boardArg] = args;
			const boardIdentifier = await resolveBoardIdentifier(context, boardArg);

			if (!boardIdentifier) {
				throw new UsageError("Usage: board boards get <board>");
			}

			const board = await api.getBoard(boardIdentifier);

			if (context.outputMode === "json") {
				print(context.io, board, "json");
			} else {
				context.io.stdout.write(`${renderBoard(board)}\n`);
			}

			return 0;
		}

		case "use":
		case "switch": {
			const [boardArg] = args;

			if (!boardArg) {
				throw new UsageError("Usage: board board use <board>");
			}

			const boardIdentifier = await resolveBoardAlias(context, boardArg);
			await setStoredDefaultBoard(boardIdentifier);
			print(context.io, { ok: true, defaultBoard: boardIdentifier }, context.outputMode);
			return 0;
		}

		default:
			throw new UsageError(
				[
					"Usage:",
					"  board boards list",
					"  board boards get <board>",
					"  board board use <board>",
					"",
					"<board> accepts a board slug, internal id, or board code.",
				].join("\n"),
			);
	}
}

async function handleLists(context: CommandContext, action: string | undefined, args: string[]) {
	const api = await createClient(context);

	switch (action) {
		case "list": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier) {
				throw new UsageError("Usage: board lists list [<board>|--board <board>]");
			}
			const board = await api.getBoard(boardIdentifier);

			if (context.outputMode === "json") {
				print(context.io, { ok: true, lists: board.lists }, "json");
			} else {
				context.io.stdout.write(`${renderLists(board.lists, board.cards)}\n`);
			}

			return 0;
		}

		default:
			throw new UsageError("Usage: board lists list [<board>|--board <board>]");
	}
}

async function handleCards(context: CommandContext, action: string | undefined, args: string[]) {
	const api = await createClient(context);

	switch (action) {
		case "get": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
				},
			});
			const { boardIdentifier, cardId } = await resolveCardTarget(context, positionals, values.board);

			if (!boardIdentifier || !cardId) {
				throw new UsageError("Usage: board card get [<board>] <card-id-or-code> [--board <board>]");
			}

			const response = await api.getCard(boardIdentifier, cardId);

			if (context.outputMode === "json") {
				print(context.io, response, "json");
			} else {
				context.io.stdout.write(`${renderCard(response.card)}\n`);
			}

			return 0;
		}

		case "view":
			return await handleCards(context, "get", args);

		case "list": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
					list: { type: "string" },
					column: { type: "string", short: "c" },
					label: { type: "string" },
					assignee: { type: "string" },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier) {
				throw new UsageError("Usage: board card list [<board>|--board <board>]");
			}
			const board = await api.getBoard(boardIdentifier);
			const listFilter = values.list ?? values.column;
			const list = listFilter ? resolveList(board.lists, listFilter) : null;
			const labelFilter = values.label;
			const cards = board.cards
				.filter((card) => !list || card.listId === list.id)
				.filter(
					(card) =>
						!labelFilter || card.labels.some((label) => matchesNameOrId(label, labelFilter)),
				)
				.filter((card) => !values.assignee || card.assigneeUserId === values.assignee)
				.sort((left, right) => {
					if (left.listId === right.listId) {
						return left.position - right.position;
					}

					return getListPosition(board.lists, left.listId) - getListPosition(board.lists, right.listId);
				})
				.map((card) => {
					const listTitle = board.lists.find((candidate) => candidate.id === card.listId)?.title ?? null;
					return {
						...card,
						listTitle,
					};
				});

			if (context.outputMode === "json") {
				print(context.io, { ok: true, cards }, "json");
			} else {
				context.io.stdout.write(`${renderCardList(cards)}\n`);
			}

			return 0;
		}

		case "create": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					list: { type: "string" },
					column: { type: "string", short: "c" },
					board: { type: "string", short: "b" },
					title: { type: "string" },
					desc: { type: "string", short: "d" },
					description: { type: "string", default: "" },
					label: { type: "string", multiple: true, default: [] },
					epic: { type: "string" },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			const listName = values.list ?? values.column;

			if (!boardIdentifier || !listName || !values.title) {
				throw new UsageError(
					"Usage: board card create [<board>] --list <list-name-or-id> --title <title> [--description <text>]",
				);
			}

			const board = await api.getBoard(boardIdentifier);
			const list = resolveList(board.lists, listName);

			const response = await api.createCard(boardIdentifier, {
				listId: list.id,
				title: values.title,
				description: decodeEscapedNewlines(values.desc ?? values.description),
				labelIds: values.label,
				...(values.epic !== undefined ? { epicId: values.epic } : {}),
			});

			printCardResponse(context, response.card);
			return 0;
		}

		case "update": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					title: { type: "string" },
					board: { type: "string", short: "b" },
					desc: { type: "string", short: "d" },
					description: { type: "string" },
					label: { type: "string", multiple: true },
					"clear-labels": { type: "boolean", default: false },
					assignee: { type: "string" },
					"clear-assignee": { type: "boolean", default: false },
					epic: { type: "string" },
					"clear-epic": { type: "boolean", default: false },
					"due-at": { type: "string" },
					"clear-due-at": { type: "boolean", default: false },
				},
			});
			const { boardIdentifier, cardId } = await resolveCardTarget(context, positionals, values.board);

			if (!boardIdentifier || !cardId) {
				throw new UsageError(
					"Usage: board cards update <board> <card-id-or-code> [--title <title>] [--description <text>] [--label <label-id>] [--clear-labels] [--assignee <user-id>] [--clear-assignee] [--epic <epic-id>] [--clear-epic] [--due-at <iso-or-ms>] [--clear-due-at]",
				);
			}

			const payload: {
				title?: string;
				description?: string;
				labelIds?: string[];
				assigneeUserId?: string | null;
				epicId?: string | null;
				dueAt?: number | null;
			} = {};

			if (values.title !== undefined) {
				payload.title = values.title;
			}

			if (values.description !== undefined) {
				payload.description = decodeEscapedNewlines(values.description);
			} else if (values.desc !== undefined) {
				payload.description = decodeEscapedNewlines(values.desc);
			}

			if (values["clear-labels"]) {
				payload.labelIds = [];
			} else if (values.label !== undefined) {
				payload.labelIds = values.label;
			}

			if (values["clear-assignee"]) {
				payload.assigneeUserId = null;
			} else if (values.assignee !== undefined) {
				payload.assigneeUserId = values.assignee;
			}

			if (values["clear-epic"]) {
				payload.epicId = null;
			} else if (values.epic !== undefined) {
				payload.epicId = values.epic;
			}

			if (values["clear-due-at"]) {
				payload.dueAt = null;
			} else if (values["due-at"] !== undefined) {
				payload.dueAt = parseDueAt(values["due-at"]);
			}

			if (Object.keys(payload).length === 0) {
				throw new UsageError("No card fields to update.");
			}

			const response = await api.updateCard(boardIdentifier, cardId, payload);

			if (!response.card) {
				throw new UsageError("Card was not returned by the API.");
			}

			printCardResponse(context, response.card);
			return 0;
		}

		case "move": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					list: { type: "string" },
					to: { type: "string" },
					column: { type: "string", short: "c" },
					board: { type: "string", short: "b" },
					index: { type: "string" },
				},
			});
			const { boardIdentifier, cardId } = await resolveCardTarget(context, positionals, values.board);
			const listName = values.list ?? values.to ?? values.column;

			if (!boardIdentifier || !cardId || !listName) {
				throw new UsageError(
					"Usage: board card move [<board>] <card-id-or-code> --list <list-name-or-id> [--index <number>]",
				);
			}

			const board = await api.getBoard(boardIdentifier);
			const list = resolveList(board.lists, listName);
			const index =
				values.index === undefined
					? board.cards.filter((card) => card.listId === list.id).length
					: Number.parseInt(values.index, 10);

			if (!Number.isInteger(index) || index < 0) {
				throw new UsageError("--index must be a non-negative integer");
			}

			const response = await api.moveCard(boardIdentifier, cardId, {
				listId: list.id,
				index,
			});

			if (!response.card) {
				throw new UsageError("Moved card was not returned by the API.");
			}

			printCardResponse(context, response.card);
			return 0;
		}

		case "comment": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					message: { type: "string" },
					body: { type: "string" },
					board: { type: "string", short: "b" },
				},
			});
			const { boardIdentifier, cardId } = await resolveCardTarget(context, positionals, values.board);
			const message = values.message ?? values.body;

			if (!boardIdentifier || !cardId || !message) {
				throw new UsageError(
					"Usage: board card comment [<board>] <card-id-or-code> --message <text>",
				);
			}

			const response = await api.addComment(boardIdentifier, cardId, {
				message: decodeEscapedNewlines(message),
			});

			if (context.outputMode === "json") {
				print(context.io, response, "json");
			} else {
				context.io.stdout.write(`${renderActivity(response.activity)}\n`);
			}

			return 0;
		}

		default:
			throw new UsageError(
				[
					"Usage:",
					"  board card list [<board>|--board <board>] [--list <name-or-id>] [--label <label>]",
					"  board card get [<board>] <card-id-or-code> [--board <board>]",
					"  board card create [<board>] --list <list-name-or-id> --title <title> [--description <text>]",
					"  board cards update <board> <card-id-or-code> [--title <title>] [--description <text>] [--label <label-id>] [--clear-labels] [--assignee <user-id>] [--clear-assignee] [--epic <epic-id>] [--clear-epic] [--due-at <iso-or-ms>] [--clear-due-at]",
					"  board card move [<board>] <card-id-or-code> --list <list-name-or-id> [--index <number>]",
					"  board card comment [<board>] <card-id-or-code> --message <text>",
					"",
					"<board> accepts a board slug, internal id, board code, or configured default.",
				].join("\n"),
			);
	}
}

function printCardResponse(context: CommandContext, card: CardRecord) {
	if (context.outputMode === "json") {
		print(context.io, { ok: true, card } satisfies JsonValue, "json");
		return;
	}

	context.io.stdout.write(`${renderCard(card)}\n`);
}

async function createClient(context: CommandContext, input: { requireToken?: boolean } = {}) {
	const auth = await loadAuthState({
		...toAuthOverrides(context),
	});

	if (input.requireToken ?? true) {
		if (!auth.token) {
			throw new UsageError(
				"Missing token. Run `board auth set-token <token>` or set BOARD_TOKEN.",
			);
		}
	}

	if (!auth.baseUrl) {
		throw new UsageError("Missing base URL.");
	}

	return new BoardApiClient({
		baseUrl: auth.baseUrl,
		...(auth.token ? { token: auth.token } : {}),
	});
}

function toAuthOverrides(context: Pick<CommandContext, "baseUrl" | "token">) {
	return {
		...(context.baseUrl ? { baseUrl: context.baseUrl } : {}),
		...(context.token ? { token: context.token } : {}),
	};
}

function parseGlobalArgs(argv: string[]) {
	const rest: string[] = [];
	const consumed: string[] = [];
	let index = 0;

	while (index < argv.length) {
		const value = argv[index];

		if (value === undefined) {
			break;
		}

		if (
			value === "--json" ||
			value === "--help" ||
			value === "-h" ||
			value === "--version" ||
			value === "-v"
		) {
			consumed.push(value);
			index += 1;
			continue;
		}

		if (
			value === "--base-url" ||
			value === "--token" ||
			value === "--format" ||
			value === "--board" ||
			value === "-b"
		) {
			consumed.push(value);
			index += 1;
			const optionValue = argv[index];

			if (!optionValue) {
				throw new UsageError(`Missing value for ${value}`);
			}

			consumed.push(optionValue);
			index += 1;
			continue;
		}

		rest.push(value);
		index += 1;
	}

	const globals = parseArgs({
		args: consumed,
		allowPositionals: false,
		options: {
			help: { type: "boolean", short: "h", default: false },
			version: { type: "boolean", short: "v", default: false },
			json: { type: "boolean", default: false },
			token: { type: "string" },
			"base-url": { type: "string" },
			format: { type: "string" },
			board: { type: "string", short: "b" },
		},
	});

	return {
		globals: globals.values,
		rest,
	};
}

async function resolveBoardIdentifier(context: CommandContext, input: string | undefined) {
	if (input) {
		return resolveBoardAlias(context, input);
	}

	if (context.defaultBoard) {
		return resolveBoardAlias(context, context.defaultBoard);
	}

	return (await loadAuthState(toAuthOverrides(context))).defaultBoard;
}

async function resolveBoardAlias(context: CommandContext, input: string) {
	if (input.startsWith("brd_") || input.includes("-")) {
		return input;
	}

	const api = await createClient(context);
	const response = await api.listBoards();
	const match = response.boards.find(
		(board) =>
			board.code.toLowerCase() === input.toLowerCase() ||
			board.slug.toLowerCase() === input.toLowerCase() ||
			board.id === input,
	);

	return match?.slug ?? input;
}

async function resolveCardTarget(
	context: CommandContext,
	positionals: string[],
	boardFlag: string | undefined,
) {
	if (boardFlag) {
		return {
			boardIdentifier: await resolveBoardIdentifier(context, boardFlag),
			cardId: positionals[0],
		};
	}

	if (positionals.length >= 2) {
		return {
			boardIdentifier: await resolveBoardIdentifier(context, positionals[0]),
			cardId: positionals[1],
		};
	}

	return {
		boardIdentifier: await resolveBoardIdentifier(context, undefined),
		cardId: positionals[0],
	};
}

function resolveList(lists: ListRecord[], input: string) {
	const match = lists.find(
		(list) => list.id === input || list.title.toLowerCase() === input.toLowerCase(),
	);

	if (!match) {
		throw new UsageError(`List not found: ${input}`);
	}

	return match;
}

function matchesNameOrId(value: { id: string; text?: string }, input: string) {
	return value.id === input || value.text?.toLowerCase() === input.toLowerCase();
}

function getListPosition(lists: ListRecord[], listId: string) {
	return lists.find((list) => list.id === listId)?.position ?? Number.MAX_SAFE_INTEGER;
}

function decodeEscapedNewlines(value: string) {
	return value.replace(/\\n/g, "\n");
}

function parseDueAt(value: string) {
	if (/^\d+$/.test(value)) {
		return Number.parseInt(value, 10);
	}

	const timestamp = Date.parse(value);

	if (Number.isNaN(timestamp)) {
		throw new UsageError("--due-at must be an ISO date/time string or a millisecond timestamp");
	}

	return timestamp;
}

function renderHelp() {
	return [
		"board",
		"",
		"CLI for The Board API.",
		"",
		"Global options:",
		"  --json",
		"  --format <json|table>",
		"  --board, -b <board>",
		"  --token <pat>",
		"  --base-url <url>",
		"  -h, --help",
		"  -v, --version",
		"",
		"Commands:",
		"  info",
		"  login",
		"  logout",
		"  auth status",
		"  auth set-token <token>",
		"  auth clear-token",
		"  auth set-base-url <url>",
		"  board use <board>",
		"  boards list",
		"  boards get <board>",
		"  lists list [<board>]",
		"  card list [<board>] [--list <list-name-or-id>]",
		"  card get [<board>] <card-id-or-code>",
		"  card create [<board>] --list <list-name-or-id> --title <title> [--description <text>]",
		"  cards update <board> <card-id-or-code> [--title <title>] [--description <text>] [--label <label-id>] [--clear-labels] [--assignee <user-id>] [--clear-assignee] [--epic <epic-id>] [--clear-epic] [--due-at <iso-or-ms>] [--clear-due-at]",
		"  card move [<board>] <card-id-or-code> --list <list-name-or-id> [--index <number>]",
		"  card comment [<board>] <card-id-or-code> --message <text>",
		"",
		"<board> accepts a board slug, internal board id, board code, or configured default.",
	].join("\n");
}

class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}
