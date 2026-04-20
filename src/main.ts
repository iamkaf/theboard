import { parseArgs } from "node:util";

import { BoardApiClient, BoardApiError } from "./api.js";
import {
	clearStoredToken,
	getConfigPath,
	loadAuthState,
	setStoredBaseUrl,
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
	type CliIo,
	type OutputMode,
} from "./output.js";
import type { CardRecord, JsonValue } from "./types.js";
import { CLI_VERSION } from "./version.js";

type CommandContext = {
	io: CliIo;
	outputMode: OutputMode;
	baseUrl: string | undefined;
	token: string | undefined;
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
			outputMode: globals.json ? "json" : "text",
			baseUrl: globals["base-url"],
			token: globals.token,
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

	if (group === "boards") {
		return await handleBoards(context, action, rest);
	}

	if (group === "cards") {
		return await handleCards(context, action, rest);
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
				hasToken: Boolean(auth.token),
			} satisfies JsonValue;

			if (context.outputMode === "json") {
				print(context.io, payload, "json");
			} else {
				context.io.stdout.write(
					`config: ${getConfigPath()}\nbaseUrl: ${auth.baseUrl ?? "unset"}\ntoken: ${
						auth.token ? "configured" : "missing"
					}\n`,
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
			const [boardId] = args;

			if (!boardId) {
				throw new UsageError("Usage: board boards get <board-id>");
			}

			const board = await api.getBoard(boardId);

			if (context.outputMode === "json") {
				print(context.io, board, "json");
			} else {
				context.io.stdout.write(`${renderBoard(board)}\n`);
			}

			return 0;
		}

		default:
			throw new UsageError(
				["Usage:", "  board boards list", "  board boards get <board-id>"].join("\n"),
			);
	}
}

async function handleCards(context: CommandContext, action: string | undefined, args: string[]) {
	const api = await createClient(context);

	switch (action) {
		case "get": {
			const [boardId, cardId] = args;

			if (!boardId || !cardId) {
				throw new UsageError("Usage: board cards get <board-id> <card-id-or-code>");
			}

			const response = await api.getCard(boardId, cardId);

			if (context.outputMode === "json") {
				print(context.io, response, "json");
			} else {
				context.io.stdout.write(`${renderCard(response.card)}\n`);
			}

			return 0;
		}

		case "create": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					list: { type: "string" },
					title: { type: "string" },
					description: { type: "string", default: "" },
					label: { type: "string", multiple: true, default: [] },
					epic: { type: "string" },
				},
			});
			const [boardId] = positionals;

			if (!boardId || !values.list || !values.title) {
				throw new UsageError(
					"Usage: board cards create <board-id> --list <list-id> --title <title> [--description <text>] [--label <label-id>] [--epic <epic-id>]",
				);
			}

			const response = await api.createCard(boardId, {
				listId: values.list,
				title: values.title,
				description: values.description,
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
			const [boardId, cardId] = positionals;

			if (!boardId || !cardId) {
				throw new UsageError(
					"Usage: board cards update <board-id> <card-id-or-code> [--title <title>] [--description <text>] [--label <label-id>] [--clear-labels] [--assignee <user-id>] [--clear-assignee] [--epic <epic-id>] [--clear-epic] [--due-at <iso-or-ms>] [--clear-due-at]",
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
				payload.description = values.description;
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

			const response = await api.updateCard(boardId, cardId, payload);

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
					index: { type: "string" },
				},
			});
			const [boardId, cardId] = positionals;

			if (!boardId || !cardId || !values.list || !values.index) {
				throw new UsageError(
					"Usage: board cards move <board-id> <card-id-or-code> --list <list-id> --index <number>",
				);
			}

			const index = Number.parseInt(values.index, 10);

			if (!Number.isInteger(index) || index < 0) {
				throw new UsageError("--index must be a non-negative integer");
			}

			const response = await api.moveCard(boardId, cardId, {
				listId: values.list,
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
				},
			});
			const [boardId, cardId] = positionals;

			if (!boardId || !cardId || !values.message) {
				throw new UsageError(
					"Usage: board cards comment <board-id> <card-id-or-code> --message <text>",
				);
			}

			const response = await api.addComment(boardId, cardId, {
				message: values.message,
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
					"  board cards get <board-id> <card-id-or-code>",
					"  board cards create <board-id> --list <list-id> --title <title> [--description <text>] [--label <label-id>] [--epic <epic-id>]",
					"  board cards update <board-id> <card-id-or-code> [--title <title>] [--description <text>] [--label <label-id>] [--clear-labels] [--assignee <user-id>] [--clear-assignee] [--epic <epic-id>] [--clear-epic] [--due-at <iso-or-ms>] [--clear-due-at]",
					"  board cards move <board-id> <card-id-or-code> --list <list-id> --index <number>",
					"  board cards comment <board-id> <card-id-or-code> --message <text>",
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
	const consumed: string[] = [];
	let index = 0;

	while (index < argv.length) {
		const value = argv[index];

		if (value === undefined || !value.startsWith("-")) {
			break;
		}

		consumed.push(value);
		index += 1;

		if (value === "--base-url" || value === "--token") {
			const optionValue = argv[index];

			if (!optionValue) {
				throw new UsageError(`Missing value for ${value}`);
			}

			consumed.push(optionValue);
			index += 1;
		}
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
		},
	});

	return {
		globals: globals.values,
		rest: argv.slice(consumed.length),
	};
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
		"  boards list",
		"  boards get <board-id>",
		"  cards get <board-id> <card-id-or-code>",
		"  cards create <board-id> --list <list-id> --title <title> [--description <text>] [--label <label-id>] [--epic <epic-id>]",
		"  cards update <board-id> <card-id-or-code> [--title <title>] [--description <text>] [--label <label-id>] [--clear-labels] [--assignee <user-id>] [--clear-assignee] [--epic <epic-id>] [--clear-epic] [--due-at <iso-or-ms>] [--clear-due-at]",
		"  cards move <board-id> <card-id-or-code> --list <list-id> --index <number>",
		"  cards comment <board-id> <card-id-or-code> --message <text>",
	].join("\n");
}

class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}
