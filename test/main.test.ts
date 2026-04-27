import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/main.js";
import { CLI_VERSION } from "../src/version.js";

test("cli can list boards as json", async () => {
	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		assert.equal(request.headers.authorization, "Bearer brd_pat_test");
		assert.equal(request.url, "/boards");

		response.setHeader("content-type", "application/json");
		response.end(
			JSON.stringify({
				ok: true,
				boards: [
					{
						id: "brd_1",
						slug: "board-1",
						code: "BRD",
						name: "Board",
						description: "",
						visibility: "private",
						role: "owner",
						position: 1024,
						updatedAt: 1,
					},
				],
			}),
		);
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address();

	assert(address && typeof address !== "string");

	let stdout = "";
	let stderr = "";

	try {
		const exitCode = await runCli(
			[
				"--json",
				"--base-url",
				`http://127.0.0.1:${address.port}`,
				"--token",
				"brd_pat_test",
				"boards",
				"list",
			],
			{
				stdout: {
					write(chunk: string | Uint8Array) {
						stdout += String(chunk);
						return true;
					},
				},
				stderr: {
					write(chunk: string | Uint8Array) {
						stderr += String(chunk);
						return true;
					},
				},
			},
		);

		assert.equal(exitCode, 0);
		assert.equal(stderr, "");
		assert.match(stdout, /"code": "BRD"/);
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error?: Error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}
});

test("cli logout clears the local token", async () => {
	let stdout = "";
	let stderr = "";
	const previousToken = process.env.BOARD_TOKEN;
	const previousConfigHome = process.env.XDG_CONFIG_HOME;
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "board-main-test-"));
	delete process.env.BOARD_TOKEN;
	process.env.XDG_CONFIG_HOME = tempDir;

	try {
		const exitCode = await runCli(["logout"], {
			stdout: {
				write(chunk: string | Uint8Array) {
					stdout += String(chunk);
					return true;
				},
			},
			stderr: {
				write(chunk: string | Uint8Array) {
					stderr += String(chunk);
					return true;
				},
			},
		});

		assert.equal(exitCode, 0);
		assert.equal(stderr, "");
		assert.match(stdout, /Removed the local CLI token/);
	} finally {
		if (previousToken !== undefined) {
			process.env.BOARD_TOKEN = previousToken;
		}

		if (previousConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME;
		} else {
			process.env.XDG_CONFIG_HOME = previousConfigHome;
		}
	}
});

test("cli reports the package version", async () => {
	let stdout = "";
	let stderr = "";

	const exitCode = await runCli(["--version"], {
		stdout: {
			write(chunk: string | Uint8Array) {
				stdout += String(chunk);
				return true;
			},
		},
		stderr: {
			write(chunk: string | Uint8Array) {
				stderr += String(chunk);
				return true;
			},
		},
	});

	assert.equal(exitCode, 0);
	assert.equal(stderr, "");
	assert.equal(stdout, `board ${CLI_VERSION}\n`);
});

test("cli cards update forwards epic flags", async () => {
	let seenBody = "";

	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		assert.equal(request.headers.authorization, "Bearer brd_pat_test");
		assert.equal(request.method, "PATCH");
		assert.equal(request.url, "/boards/board-1/cards/BRD-1");
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			seenBody += chunk;
		});
		request.on("end", () => {
			response.setHeader("content-type", "application/json");
			response.end(
				JSON.stringify({
					ok: true,
					card: {
						id: "crd_1",
						boardId: "brd_1",
						listId: "lst_1",
						number: 1,
						identifier: "BRD-1",
						title: "Updated",
						description: "",
						labels: [],
						position: 1024,
						assigneeUserId: null,
						epicId: null,
						dueAt: null,
					},
				}),
			);
		});
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address();

	assert(address && typeof address !== "string");

	let stdout = "";
	let stderr = "";

	try {
		const exitCode = await runCli(
			[
				"--base-url",
				`http://127.0.0.1:${address.port}`,
				"--token",
				"brd_pat_test",
				"cards",
				"update",
				"board-1",
				"BRD-1",
				"--clear-epic",
			],
			{
				stdout: {
					write(chunk: string | Uint8Array) {
						stdout += String(chunk);
						return true;
					},
				},
				stderr: {
					write(chunk: string | Uint8Array) {
						stderr += String(chunk);
						return true;
					},
				},
			},
		);

		assert.equal(exitCode, 0);
		assert.equal(stderr, "");
		assert.deepEqual(JSON.parse(seenBody), {
			epicId: null,
		});
		assert.match(stdout, /BRD-1 Updated/);
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error?: Error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}
});

test("cli accepts json as a trailing global flag", async () => {
	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		assert.equal(request.url, "/boards");
		response.setHeader("content-type", "application/json");
		response.end(JSON.stringify({ ok: true, boards: [] }));
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address();
	assert(address && typeof address !== "string");

	let stdout = "";
	let stderr = "";

	try {
		const exitCode = await runCli(
			[
				"boards",
				"list",
				"--json",
				"--base-url",
				`http://127.0.0.1:${address.port}`,
				"--token",
				"brd_pat_test",
			],
			captureIo(
				(chunk) => {
					stdout += chunk;
				},
				(chunk) => {
					stderr += chunk;
				},
			),
		);

		assert.equal(exitCode, 0);
		assert.equal(stderr, "");
		assert.deepEqual(JSON.parse(stdout), { ok: true, boards: [] });
	} finally {
		await closeServer(server);
	}
});

test("cli lists cards with singular command and list title filter", async () => {
	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		assert.equal(request.url, "/boards/board-1");
		response.setHeader("content-type", "application/json");
		response.end(JSON.stringify(boardPayload()));
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address();
	assert(address && typeof address !== "string");

	let stdout = "";
	let stderr = "";

	try {
		const exitCode = await runCli(
			[
				"--base-url",
				`http://127.0.0.1:${address.port}`,
				"--token",
				"brd_pat_test",
				"card",
				"list",
				"board-1",
				"--list",
				"Doing",
			],
			captureIo(
				(chunk) => {
					stdout += chunk;
				},
				(chunk) => {
					stderr += chunk;
				},
			),
		);

		assert.equal(exitCode, 0);
		assert.equal(stderr, "");
		assert.match(stdout, /BRD-2\s+Second \(Doing\)/);
		assert.doesNotMatch(stdout, /BRD-1/);
	} finally {
		await closeServer(server);
	}
});

test("cli moves cards by list title and appends when index is omitted", async () => {
	let seenBody = "";
	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		if (request.url === "/boards/board-1" && request.method === "GET") {
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify(boardPayload()));
			return;
		}

		assert.equal(request.method, "PATCH");
		assert.equal(request.url, "/boards/board-1/cards/BRD-1/move");
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			seenBody += chunk;
		});
		request.on("end", () => {
			response.setHeader("content-type", "application/json");
			response.end(
				JSON.stringify({
					ok: true,
					card: { ...cardPayload("crd_1", "BRD-1", "First"), listId: "lst_done" },
					cards: [],
				}),
			);
		});
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address();
	assert(address && typeof address !== "string");

	let stdout = "";
	let stderr = "";

	try {
		const exitCode = await runCli(
			[
				"--base-url",
				`http://127.0.0.1:${address.port}`,
				"--token",
				"brd_pat_test",
				"card",
				"move",
				"board-1",
				"BRD-1",
				"--to",
				"Done",
			],
			captureIo(
				(chunk) => {
					stdout += chunk;
				},
				(chunk) => {
					stderr += chunk;
				},
			),
		);

		assert.equal(exitCode, 0);
		assert.equal(stderr, "");
		assert.deepEqual(JSON.parse(seenBody), { listId: "lst_done", index: 1 });
		assert.match(stdout, /BRD-1 First/);
	} finally {
		await closeServer(server);
	}
});

test("cli decodes escaped newlines in comments", async () => {
	let seenBody = "";
	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		assert.equal(request.method, "POST");
		assert.equal(request.url, "/boards/board-1/cards/BRD-1/comments");
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			seenBody += chunk;
		});
		request.on("end", () => {
			response.setHeader("content-type", "application/json");
			response.end(
				JSON.stringify({
					ok: true,
					activity: {
						id: "act_1",
						boardId: "brd_1",
						cardId: "crd_1",
						kind: "comment.created",
						message: "one\ntwo",
						createdAt: 1,
						actor: null,
					},
				}),
			);
		});
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address();
	assert(address && typeof address !== "string");

	let stdout = "";
	let stderr = "";

	try {
		const exitCode = await runCli(
			[
				"--base-url",
				`http://127.0.0.1:${address.port}`,
				"--token",
				"brd_pat_test",
				"card",
				"comment",
				"board-1",
				"BRD-1",
				"--message",
				"one\\ntwo",
			],
			captureIo(
				(chunk) => {
					stdout += chunk;
				},
				(chunk) => {
					stderr += chunk;
				},
			),
		);

		assert.equal(exitCode, 0);
		assert.equal(stderr, "");
		assert.deepEqual(JSON.parse(seenBody), { message: "one\ntwo" });
		assert.match(stdout, /one\ntwo/);
	} finally {
		await closeServer(server);
	}
});

function captureIo(onStdout: (chunk: string) => void, onStderr: (chunk: string) => void) {
	return {
		stdout: {
			write(chunk: string | Uint8Array) {
				onStdout(String(chunk));
				return true;
			},
		},
		stderr: {
			write(chunk: string | Uint8Array) {
				onStderr(String(chunk));
				return true;
			},
		},
	};
}

async function closeServer(server: ReturnType<typeof createServer>) {
	await new Promise<void>((resolve, reject) => {
		server.close((error?: Error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}

function boardPayload() {
	return {
		ok: true,
		board: {
			id: "brd_1",
			slug: "board-1",
			code: "BRD",
			name: "Board",
			description: "",
			visibility: "private",
			role: "owner",
			position: 1024,
			updatedAt: 1,
		},
		boardMembers: [],
		boardLabels: [],
		epics: [],
		cardTemplates: [],
		lists: [
			{ id: "lst_todo", boardId: "brd_1", title: "To Do", position: 1024 },
			{ id: "lst_doing", boardId: "brd_1", title: "Doing", position: 2048 },
			{ id: "lst_done", boardId: "brd_1", title: "Done", position: 3072 },
		],
		cards: [
			cardPayload("crd_1", "BRD-1", "First", "lst_todo", 1024),
			cardPayload("crd_2", "BRD-2", "Second", "lst_doing", 1024),
			cardPayload("crd_3", "BRD-3", "Third", "lst_done", 1024),
		],
	};
}

function cardPayload(
	id: string,
	identifier: string,
	title: string,
	listId = "lst_todo",
	position = 1024,
) {
	return {
		id,
		boardId: "brd_1",
		listId,
		number: Number(identifier.split("-")[1] ?? 1),
		identifier,
		title,
		description: "",
		labels: [],
		position,
		assigneeUserId: null,
		epicId: null,
		dueAt: null,
	};
}
