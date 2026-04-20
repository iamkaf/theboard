import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import test from "node:test";

import { runCli } from "../src/main.js";

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
	delete process.env.BOARD_TOKEN;

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
	assert.equal(stdout, "board 1.0.0\n");
});

test("cli cards update forwards epic flags", async () => {
	let seenBody = "";

	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		assert.equal(request.headers.authorization, "Bearer brd_pat_test");
		assert.equal(request.method, "PATCH");
		assert.equal(request.url, "/boards/brd_1/cards/BRD-1");
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
				"brd_1",
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
