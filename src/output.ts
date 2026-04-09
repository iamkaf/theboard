import type { BoardDetail, BoardSummary, CardActivityRecord, CardRecord, JsonValue } from "./types.js";

export type OutputMode = "text" | "json";

export type CliIo = {
	stdout: Pick<typeof process.stdout, "write">;
	stderr: Pick<typeof process.stderr, "write">;
};

export function print(io: CliIo, value: JsonValue, mode: OutputMode) {
	if (mode === "json") {
		io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
		return;
	}

	io.stdout.write(`${formatText(value)}\n`);
}

export function printError(io: CliIo, message: string) {
	io.stderr.write(`${message}\n`);
}

export function renderBoards(boards: BoardSummary[]) {
	if (boards.length === 0) {
		return "No boards found.";
	}

	return boards
		.map(
			(board) =>
				`${board.code.padEnd(6)} ${board.name} (${board.visibility}, ${board.role ?? "guest"})\n  id: ${board.id}\n  slug: ${board.slug}`,
		)
		.join("\n");
}

export function renderBoard(board: BoardDetail) {
	const lists = board.lists
		.map((list) => {
			const cards = board.cards
				.filter((card) => card.listId === list.id)
				.sort((left, right) => left.position - right.position)
				.map((card) => `    - ${card.identifier}: ${card.title}`)
				.join("\n");

			return `${list.title} (${list.id})${cards ? `\n${cards}` : "\n    - no cards"}`;
		})
		.join("\n");

	return [
		`${board.board.code} ${board.board.name}`,
		`id: ${board.board.id}`,
		`slug: ${board.board.slug}`,
		`visibility: ${board.board.visibility}`,
		`lists:`,
		lists,
	].join("\n");
}

export function renderCard(card: CardRecord) {
	const lines = [
		`${card.identifier} ${card.title}`,
		`id: ${card.id}`,
		`board: ${card.boardId}`,
		`list: ${card.listId}`,
	];

	if (card.labels.length > 0) {
		lines.push(`labels: ${card.labels.map((label) => label.text || label.id).join(", ")}`);
	}

	if (card.dueAt !== null) {
		lines.push(`dueAt: ${new Date(card.dueAt).toISOString()}`);
	}

	if (card.description) {
		lines.push("description:");
		lines.push(card.description);
	}

	return lines.join("\n");
}

export function renderActivity(activity: CardActivityRecord) {
	return `${activity.kind} ${new Date(activity.createdAt).toISOString()}\n${activity.message}`;
}

function formatText(value: JsonValue): string {
	if (typeof value === "string") {
		return value;
	}

	return JSON.stringify(value, null, 2);
}
