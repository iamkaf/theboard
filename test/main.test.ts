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
	const previousToken = process.env.THEBOARD_TOKEN;
	delete process.env.THEBOARD_TOKEN;

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
			process.env.THEBOARD_TOKEN = previousToken;
		}
	}
});
