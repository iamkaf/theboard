import assert from "node:assert/strict";
import test from "node:test";

import { startCallbackServer } from "../src/callback-server.js";

test("callback server resolves successful login callback", async () => {
	const server = await startCallbackServer();

	try {
		const responsePromise = fetch(
			`${server.redirectUri}?authorizationId=cla_1&state=test_state&code=test_code`,
		);
		const callback = await server.waitForCallback(1000);
		const response = await responsePromise;

		assert.equal(callback.authorizationId, "cla_1");
		assert.equal("code" in callback && callback.code, "test_code");
		assert.equal(response.status, 200);
	} finally {
		await server.close();
	}
});

test("callback server resolves cancelled login callback", async () => {
	const server = await startCallbackServer();

	try {
		const responsePromise = fetch(
			`${server.redirectUri}?authorizationId=cla_1&state=test_state&error=access_denied`,
		);
		const callback = await server.waitForCallback(1000);
		const response = await responsePromise;

		assert.equal(callback.authorizationId, "cla_1");
		assert.equal("error" in callback && callback.error, "access_denied");
		assert.equal(response.status, 200);
	} finally {
		await server.close();
	}
});
