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
	renderActivityList,
	renderBoard,
	renderBoards,
	renderCard,
	renderCardList,
	renderEpics,
	renderLabels,
	renderLists,
	renderTemplates,
	type CliIo,
	type OutputMode,
} from "./output.js";
import type { BoardDetail, CardRecord, JsonValue, ListRecord } from "./types.js";
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
			outputMode: resolveOutputMode(globals.format, globals.json),
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

	if (group === "labels" || group === "label") {
		return await handleLabels(context, action, rest);
	}

	if (group === "epics" || group === "epic") {
		return await handleEpics(context, action, rest);
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
		case "create": {
			const { values } = parseArgs({
				args,
				allowPositionals: false,
				options: {
					name: { type: "string" },
					code: { type: "string" },
					description: { type: "string", default: "" },
					visibility: { type: "string", default: "private" },
					template: { type: "string" },
					use: { type: "boolean", default: false },
				},
			});

			if (!values.name || !values.code) {
				throw new UsageError("Usage: board board create --name <name> --code <code> [--description <text>] [--visibility private|public] [--use]");
			}

			const response = await api.createBoard({
				name: values.name,
				code: values.code,
				description: decodeEscapedNewlines(values.description),
				visibility: parseVisibility(values.visibility),
				...(values.template ? { templateId: values.template } : {}),
			});

			if (values.use) {
				await setStoredDefaultBoard(response.board.slug);
			}

			print(context.io, response, context.outputMode);
			return 0;
		}

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

		case "update": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					name: { type: "string" },
					code: { type: "string" },
					description: { type: "string" },
					visibility: { type: "string" },
					"allow-public-comments": { type: "boolean" },
					"deny-public-comments": { type: "boolean" },
					"epic-completion-list": { type: "string" },
					"clear-epic-completion-list": { type: "boolean", default: false },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, positionals[0]);

			if (!boardIdentifier) {
				throw new UsageError("Usage: board board update [<board>] [--name <name>] [--code <code>] [--description <text>] [--visibility private|public]");
			}

			const payload: Record<string, JsonValue> = {};
			if (values.name !== undefined) payload.name = values.name;
			if (values.code !== undefined) payload.code = values.code;
			if (values.description !== undefined) payload.description = decodeEscapedNewlines(values.description);
			if (values.visibility !== undefined) payload.visibility = parseVisibility(values.visibility);
			if (values["allow-public-comments"]) payload.allowPublicComments = true;
			if (values["deny-public-comments"]) payload.allowPublicComments = false;
			if (values["clear-epic-completion-list"]) {
				payload.epicCompletionListId = null;
			} else if (values["epic-completion-list"] !== undefined) {
				const board = await api.getBoard(boardIdentifier);
				payload.epicCompletionListId = resolveList(board.lists, values["epic-completion-list"]).id;
			}
			if (Object.keys(payload).length === 0) throw new UsageError("No board fields to update.");

			print(context.io, await api.updateBoard(boardIdentifier, payload), context.outputMode);
			return 0;
		}

		case "reorder": {
			const { values } = parseArgs({
				args,
				allowPositionals: false,
				options: {
					boards: { type: "string" },
				},
			});
			if (!values.boards) {
				throw new UsageError("Usage: board board reorder --boards <board,board,...>");
			}
			const ids = await resolveBoardOrder(context, splitCsv(values.boards));
			print(context.io, await api.reorderBoards(ids), context.outputMode);
			return 0;
		}

		case "archive":
		case "delete": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { force: { type: "boolean", default: false } },
			});
			const boardIdentifier = await resolveBoardIdentifier(context, positionals[0]);
			if (!boardIdentifier) throw new UsageError(`Usage: board board ${action} <board> --force`);
			if (!values.force) throw new UsageError(`Refusing to ${action} board without --force.`);
			const response = action === "archive"
				? await api.archiveBoard(boardIdentifier)
				: await api.deleteBoard(boardIdentifier);
			print(context.io, response, context.outputMode);
			return 0;
		}

		default:
			throw new UsageError(
				[
					"Usage:",
					"  board boards list",
					"  board boards get <board>",
					"  board board create --name <name> --code <code>",
					"  board board update [<board>] [--name <name>] [--code <code>]",
					"  board board use <board>",
					"  board board reorder --boards <board,board,...>",
					"  board board archive <board> --force",
					"  board board delete <board> --force",
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

		case "create": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { board: { type: "string", short: "b" }, title: { type: "string" } },
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			const title = values.title ?? positionals[boardIdentifier === positionals[0] ? 1 : 0];
			if (!boardIdentifier || !title) {
				throw new UsageError("Usage: board list create [<board>] --title <title>");
			}
			print(context.io, await api.createList(boardIdentifier, { title }), context.outputMode);
			return 0;
		}

		case "rename":
		case "update": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
					title: { type: "string" },
					"new-card-placement": { type: "string" },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? (positionals.length > 1 ? positionals[0] : undefined));
			const listName = positionals.length > 1 && !values.board ? positionals[1] : positionals[0];
			if (!boardIdentifier || !listName) {
				throw new UsageError("Usage: board list update [<board>] <list> [--title <title>] [--new-card-placement top|bottom]");
			}
			const board = await api.getBoard(boardIdentifier);
			const list = resolveList(board.lists, listName);
			const payload: { title?: string; newCardPlacement?: "top" | "bottom" } = {};
			if (values.title !== undefined) payload.title = values.title;
			if (values["new-card-placement"] !== undefined) {
				payload.newCardPlacement = parsePlacement(values["new-card-placement"]);
			}
			if (Object.keys(payload).length === 0) throw new UsageError("No list fields to update.");
			print(context.io, await api.updateList(boardIdentifier, list.id, payload), context.outputMode);
			return 0;
		}

		case "reorder": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { board: { type: "string", short: "b" }, lists: { type: "string" } },
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier || !values.lists) {
				throw new UsageError("Usage: board list reorder [<board>] --lists <list,list,...>");
			}
			const board = await api.getBoard(boardIdentifier);
			const ids = splitCsv(values.lists).map((entry) => resolveList(board.lists, entry).id);
			print(context.io, await api.reorderLists(boardIdentifier, ids), context.outputMode);
			return 0;
		}

		case "archive":
		case "delete": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { board: { type: "string", short: "b" }, force: { type: "boolean", default: false } },
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? (positionals.length > 1 ? positionals[0] : undefined));
			const listName = positionals.length > 1 && !values.board ? positionals[1] : positionals[0];
			if (!boardIdentifier || !listName) throw new UsageError(`Usage: board list ${action} [<board>] <list> --force`);
			if (!values.force) throw new UsageError(`Refusing to ${action} list without --force.`);
			const board = await api.getBoard(boardIdentifier);
			const list = resolveList(board.lists, listName);
			const response = action === "archive"
				? await api.archiveList(boardIdentifier, list.id)
				: await api.deleteList(boardIdentifier, list.id);
			print(context.io, response, context.outputMode);
			return 0;
		}

		case "setup": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
					preset: { type: "string", default: "planning" },
					lists: { type: "string" },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier) throw new UsageError("Usage: board list setup [<board>] [--preset planning|kanban] [--lists <a,b,c>]");
			const names = values.lists ? splitCsv(values.lists) : listPreset(values.preset);
			const board = await api.getBoard(boardIdentifier);
			const existing = new Set(board.lists.map((list) => list.title.toLowerCase()));
			const created = [];
			for (const title of names) {
				if (!existing.has(title.toLowerCase())) {
					created.push((await api.createList(boardIdentifier, { title })).list);
				}
			}
			const refreshed = await api.getBoard(boardIdentifier);
			const order = names
				.map((name) => refreshed.lists.find((list) => list.title.toLowerCase() === name.toLowerCase()))
				.filter((list): list is ListRecord => Boolean(list));
			const rest = refreshed.lists.filter((list) => !order.some((ordered) => ordered.id === list.id));
			const reordered = await api.reorderLists(boardIdentifier, [...order, ...rest].map((list) => list.id));
			print(context.io, { ok: true, created, lists: reordered.lists }, context.outputMode);
			return 0;
		}

		default:
			throw new UsageError(
				[
					"Usage:",
					"  board list list [<board>]",
					"  board list create [<board>] --title <title>",
					"  board list update [<board>] <list> [--title <title>]",
					"  board list reorder [<board>] --lists <list,list,...>",
					"  board list setup [<board>] [--preset planning|kanban]",
					"  board list archive [<board>] <list> --force",
					"  board list delete [<board>] <list> --force",
				].join("\n"),
			);
	}
}

async function handleLabels(context: CommandContext, action: string | undefined, args: string[]) {
	const api = await createClient(context);

	switch (action) {
		case "list": {
			const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { board: { type: "string", short: "b" } } });
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier) throw new UsageError("Usage: board label list [<board>]");
			const board = await api.getBoard(boardIdentifier);
			if (context.outputMode === "json") print(context.io, { ok: true, labels: board.boardLabels }, "json");
			else context.io.stdout.write(`${renderLabels(board.boardLabels)}\n`);
			return 0;
		}

		case "create":
		case "update": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
					text: { type: "string" },
					color: { type: "string", default: "gray" },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? (action === "update" && positionals.length > 1 ? positionals[0] : undefined));
			if (!boardIdentifier || !values.text) throw new UsageError(`Usage: board label ${action} [<board>] ${action === "update" ? "<label> " : ""}--text <text> [--color <color>]`);
			if (action === "create") {
				print(context.io, await api.createLabel(boardIdentifier, { text: values.text, color: values.color }), context.outputMode);
				return 0;
			}
			const labelName = positionals.length > 1 && !values.board ? positionals[1] : positionals[0];
			if (!labelName) throw new UsageError("Usage: board label update [<board>] <label> --text <text> [--color <color>]");
			const board = await api.getBoard(boardIdentifier);
			const label = resolveLabel(board.boardLabels, labelName);
			print(context.io, await api.updateLabel(boardIdentifier, label.id, { text: values.text, color: values.color }), context.outputMode);
			return 0;
		}

		case "delete": {
			const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { board: { type: "string", short: "b" }, force: { type: "boolean", default: false } } });
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? (positionals.length > 1 ? positionals[0] : undefined));
			const labelName = positionals.length > 1 && !values.board ? positionals[1] : positionals[0];
			if (!boardIdentifier || !labelName) throw new UsageError("Usage: board label delete [<board>] <label> --force");
			if (!values.force) throw new UsageError("Refusing to delete label without --force.");
			const board = await api.getBoard(boardIdentifier);
			const label = resolveLabel(board.boardLabels, labelName);
			print(context.io, await api.deleteLabel(boardIdentifier, label.id), context.outputMode);
			return 0;
		}

		default:
			throw new UsageError("Usage: board label list|create|update|delete");
	}
}

async function handleEpics(context: CommandContext, action: string | undefined, args: string[]) {
	const api = await createClient(context);

	switch (action) {
		case "list": {
			const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { board: { type: "string", short: "b" } } });
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier) throw new UsageError("Usage: board epic list [<board>]");
			const response = await api.listEpics(boardIdentifier);
			if (context.outputMode === "json") print(context.io, response, "json");
			else context.io.stdout.write(`${renderEpics(response.epics)}\n`);
			return 0;
		}

		case "create":
		case "update": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
					name: { type: "string" },
					description: { type: "string", default: "" },
					color: { type: "string", default: "green" },
					status: { type: "string" },
					owner: { type: "string" },
					"start-at": { type: "string" },
					"target-at": { type: "string" },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? (action === "update" && positionals.length > 1 ? positionals[0] : undefined));
			if (!boardIdentifier) throw new UsageError(`Usage: board epic ${action} [<board>] ${action === "update" ? "<epic> " : ""}--name <name>`);
				if (action === "create") {
					if (!values.name) throw new UsageError("Usage: board epic create [<board>] --name <name> [--color <color>]");
					print(context.io, await api.createEpic(boardIdentifier, buildEpicPayload(values) as {
						name: string;
						description?: string;
						color?: string;
						status?: string;
						ownerUserId?: string | null;
						startAt?: number | null;
						targetAt?: number | null;
					}), context.outputMode);
				return 0;
			}
			const epicName = positionals.length > 1 && !values.board ? positionals[1] : positionals[0];
			if (!epicName) throw new UsageError("Usage: board epic update [<board>] <epic> [--name <name>]");
			const board = await api.getBoard(boardIdentifier);
			const epic = resolveEpic(board.epics, epicName);
			const payload = buildEpicPayload(values, true);
			if (Object.keys(payload).length === 0) throw new UsageError("No epic fields to update.");
			print(context.io, await api.updateEpic(boardIdentifier, epic.id, payload), context.outputMode);
			return 0;
		}

		case "archive":
		case "delete": {
			const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { board: { type: "string", short: "b" }, force: { type: "boolean", default: false } } });
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? (positionals.length > 1 ? positionals[0] : undefined));
			const epicName = positionals.length > 1 && !values.board ? positionals[1] : positionals[0];
			if (!boardIdentifier || !epicName) throw new UsageError(`Usage: board epic ${action} [<board>] <epic> --force`);
			if (!values.force) throw new UsageError(`Refusing to ${action} epic without --force.`);
			const board = await api.getBoard(boardIdentifier);
			const epic = resolveEpic(board.epics, epicName);
			const response = action === "archive" ? await api.archiveEpic(boardIdentifier, epic.id) : await api.deleteEpic(boardIdentifier, epic.id);
			print(context.io, response, context.outputMode);
			return 0;
		}

		default:
			throw new UsageError("Usage: board epic list|create|update|archive|delete");
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

		case "activity":
		case "comments": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { board: { type: "string", short: "b" } },
			});
			const { boardIdentifier, cardId } = await resolveCardTarget(context, positionals, values.board);
			if (!boardIdentifier || !cardId) throw new UsageError(`Usage: board card ${action} [<board>] <card>`);
			const response = await api.getCardActivity(boardIdentifier, cardId);
			const activity = action === "comments"
				? response.activity.filter((entry) => entry.kind === "comment")
				: response.activity;
			if (context.outputMode === "json") print(context.io, { ok: true, activity }, "json");
			else context.io.stdout.write(`${renderActivityList(activity)}\n`);
			return 0;
		}

		case "archive":
		case "delete": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { board: { type: "string", short: "b" }, force: { type: "boolean", default: false } },
			});
			const { boardIdentifier, cardId } = await resolveCardTarget(context, positionals, values.board);
			if (!boardIdentifier || !cardId) throw new UsageError(`Usage: board card ${action} [<board>] <card> --force`);
			if (!values.force) throw new UsageError(`Refusing to ${action} card without --force.`);
			const response = action === "archive" ? await api.archiveCard(boardIdentifier, cardId) : await api.deleteCard(boardIdentifier, cardId);
			print(context.io, response, context.outputMode);
			return 0;
		}

		case "reorder": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { board: { type: "string", short: "b" }, list: { type: "string" }, cards: { type: "string" } },
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier || !values.list || !values.cards) {
				throw new UsageError("Usage: board card reorder [<board>] --list <list> --cards <card,card,...>");
			}
			const board = await api.getBoard(boardIdentifier);
			const list = resolveList(board.lists, values.list);
			const requestedCards = splitCsv(values.cards);
			const requestedIds = requestedCards.map((entry) => resolveCard(board, entry).id);
			const lists = board.lists.map((candidate) => {
				const existing = board.cards
					.filter((card) => card.listId === candidate.id)
					.sort((left, right) => left.position - right.position)
					.map((card) => card.id);
				if (candidate.id !== list.id) {
					return { listId: candidate.id, cardIds: existing };
				}
				return {
					listId: candidate.id,
					cardIds: [...requestedIds, ...existing.filter((cardId) => !requestedIds.includes(cardId))],
				};
			});
			print(context.io, await api.reorderCards(boardIdentifier, lists), context.outputMode);
			return 0;
		}

		case "link": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
					target: { type: "string" },
					relation: { type: "string", default: "relates_to" },
					blocks: { type: "string" },
					"blocked-by": { type: "string" },
					"relates-to": { type: "string" },
				},
			});
			const { boardIdentifier, cardId } = await resolveCardTarget(context, positionals, values.board);
			const target = values.target ?? values.blocks ?? values["blocked-by"] ?? values["relates-to"];
			if (!boardIdentifier || !cardId || !target) throw new UsageError("Usage: board card link [<board>] <card> --target <card> [--relation blocks|blocked_by|relates_to]");
			const relation = values.blocks ? "blocks" : values["blocked-by"] ? "blocked_by" : values["relates-to"] ? "relates_to" : parseRelation(values.relation);
			print(context.io, await api.createCardLink(boardIdentifier, cardId, { targetCardId: target, relation }), context.outputMode);
			return 0;
		}

		case "unlink": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { board: { type: "string", short: "b" }, link: { type: "string" } },
			});
			const { boardIdentifier, cardId } = await resolveCardTarget(context, positionals, values.board);
			if (!boardIdentifier || !cardId || !values.link) throw new UsageError("Usage: board card unlink [<board>] <card> --link <link-id>");
			print(context.io, await api.deleteCardLink(boardIdentifier, cardId, values.link), context.outputMode);
			return 0;
		}

		case "templates": {
			const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { board: { type: "string", short: "b" } } });
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier) throw new UsageError("Usage: board card templates [<board>]");
			const board = await api.getBoard(boardIdentifier);
			if (context.outputMode === "json") print(context.io, { ok: true, templates: board.cardTemplates }, "json");
			else context.io.stdout.write(`${renderTemplates(board.cardTemplates)}\n`);
			return 0;
		}

		case "template-create": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: {
					board: { type: "string", short: "b" },
					name: { type: "string" },
					title: { type: "string" },
					description: { type: "string", default: "" },
					label: { type: "string", multiple: true, default: [] },
				},
			});
			const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
			if (!boardIdentifier || !values.name || !values.title) throw new UsageError("Usage: board card template-create [<board>] --name <name> --title <title>");
			print(context.io, await api.createCardTemplate(boardIdentifier, { name: values.name, title: values.title, description: values.description, labelIds: values.label }), context.outputMode);
			return 0;
		}

		case "from-template": {
			const { positionals, values } = parseArgs({
				args,
				allowPositionals: true,
				options: { board: { type: "string", short: "b" }, template: { type: "string" }, list: { type: "string" } },
			});
				const boardIdentifier = await resolveBoardIdentifier(context, values.board ?? positionals[0]);
				if (!boardIdentifier || !values.template || !values.list) throw new UsageError("Usage: board card from-template [<board>] --template <template> --list <list>");
				const templateName = values.template;
				const board = await api.getBoard(boardIdentifier);
				const template = board.cardTemplates.find((entry) => entry.id === templateName || entry.name.toLowerCase() === templateName.toLowerCase());
				if (!template) throw new UsageError(`Template not found: ${templateName}`);
			const list = resolveList(board.lists, values.list);
			print(context.io, await api.createCardFromTemplate(boardIdentifier, template.id, { listId: list.id }), context.outputMode);
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
					"  board card activity [<board>] <card-id-or-code>",
					"  board card archive [<board>] <card-id-or-code> --force",
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

function resolveOutputMode(format: string | undefined, json: boolean): OutputMode {
	if (json) return "json";
	if (format === undefined || format === "text" || format === "table") return "text";
	if (format === "json") return "json";
	throw new UsageError("--format must be one of: text, table, json");
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

async function resolveBoardOrder(context: CommandContext, inputs: string[]) {
	const api = await createClient(context);
	const response = await api.listBoards();
	return inputs.map((input) => {
		const match = response.boards.find(
			(board) =>
				board.id === input ||
				board.slug.toLowerCase() === input.toLowerCase() ||
				board.code.toLowerCase() === input.toLowerCase(),
		);
		if (!match) throw new UsageError(`Board not found: ${input}`);
		return match.id;
	});
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

function resolveLabel(labels: Array<{ id: string; text: string }>, input: string) {
	const match = labels.find((label) => label.id === input || label.text.toLowerCase() === input.toLowerCase());
	if (!match) throw new UsageError(`Label not found: ${input}`);
	return match;
}

function resolveEpic(epics: Array<{ id: string; name: string }>, input: string) {
	const match = epics.find((epic) => epic.id === input || epic.name.toLowerCase() === input.toLowerCase());
	if (!match) throw new UsageError(`Epic not found: ${input}`);
	return match;
}

function resolveCard(board: BoardDetail, input: string) {
	const match = board.cards.find((card) => card.id === input || card.identifier.toLowerCase() === input.toLowerCase());
	if (!match) throw new UsageError(`Card not found: ${input}`);
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

function splitCsv(value: string) {
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function parseVisibility(value: string) {
	if (value === "private" || value === "public") return value;
	throw new UsageError("--visibility must be private or public");
}

function parsePlacement(value: string) {
	if (value === "top" || value === "bottom") return value;
	throw new UsageError("--new-card-placement must be top or bottom");
}

function parseRelation(value: string) {
	if (value === "blocks" || value === "blocked_by" || value === "relates_to") return value;
	throw new UsageError("--relation must be blocks, blocked_by, or relates_to");
}

function listPreset(value: string) {
	switch (value) {
		case "planning":
			return ["Backlog", "Planning", "To Do", "Doing", "Done"];
		case "kanban":
			return ["To Do", "Doing", "Done"];
		default:
			throw new UsageError("--preset must be planning or kanban");
	}
}

function buildEpicPayload(
	values: {
		name?: string;
		description?: string;
		color?: string;
		status?: string;
		owner?: string;
		"start-at"?: string;
		"target-at"?: string;
	},
	partial = false,
) {
	const payload: Record<string, JsonValue> = {};
	if (values.name !== undefined) payload.name = values.name;
	if (!partial || values.description !== undefined) payload.description = decodeEscapedNewlines(values.description ?? "");
	if (!partial || values.color !== undefined) payload.color = values.color ?? "green";
	if (values.status !== undefined) payload.status = values.status;
	if (values.owner !== undefined) payload.ownerUserId = values.owner;
	if (values["start-at"] !== undefined) payload.startAt = parseDueAt(values["start-at"]);
	if (values["target-at"] !== undefined) payload.targetAt = parseDueAt(values["target-at"]);
	return payload;
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
		"  board create --name <name> --code <code>",
		"  board update [<board>] [--name <name>] [--code <code>]",
		"  board archive <board> --force",
		"  board delete <board> --force",
		"  lists list [<board>]",
		"  list create [<board>] --title <title>",
		"  list setup [<board>] [--preset planning|kanban]",
		"  label list|create|update|delete",
		"  epic list|create|update|archive|delete",
		"  card list [<board>] [--list <list-name-or-id>]",
		"  card get [<board>] <card-id-or-code>",
		"  card create [<board>] --list <list-name-or-id> --title <title> [--description <text>]",
		"  card update [<board>] <card-id-or-code> [--title <title>] [--description <text>]",
		"  card move [<board>] <card-id-or-code> --list <list-name-or-id> [--index <number>]",
		"  card comment [<board>] <card-id-or-code> --message <text>",
		"  card activity [<board>] <card-id-or-code>",
		"  card archive|delete [<board>] <card-id-or-code> --force",
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
