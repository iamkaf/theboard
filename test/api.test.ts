import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import test from "node:test";

import { BoardApiClient } from "../src/api.js";

test("api client sends bearer auth and json body", async () => {
	let seenAuthorization = "";
	let seenMethod = "";
	let seenBody = "";

	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		seenAuthorization = request.headers.authorization ?? "";
		seenMethod = request.method ?? "";
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
						title: "Created",
						description: "",
						labels: [],
						position: 1024,
						assigneeUserId: null,
						dueAt: null,
					},
				}),
			);
		});
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address();

	assert(address && typeof address !== "string");

	try {
		const client = new BoardApiClient({
			baseUrl: `http://127.0.0.1:${address.port}`,
			token: "brd_pat_test",
		});
		const response = await client.createCard("brd_1", {
			listId: "lst_1",
			title: "Created",
		});

		assert.equal(response.card.identifier, "BRD-1");
		assert.equal(seenAuthorization, "Bearer brd_pat_test");
		assert.equal(seenMethod, "POST");
		assert.deepEqual(JSON.parse(seenBody), {
			listId: "lst_1",
			title: "Created",
			description: "",
			labelIds: [],
		});
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
