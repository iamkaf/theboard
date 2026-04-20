import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
	clearStoredToken,
	getConfigPath,
	loadAuthState,
	setStoredBaseUrl,
	setStoredToken,
} from "../src/config.js";

test("config roundtrips token and base url", async () => {
	const previousConfigHome = process.env.XDG_CONFIG_HOME;
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "boardsh-config-"));
	process.env.XDG_CONFIG_HOME = tempDir;

	try {
		await setStoredToken("brd_pat_test");
		await setStoredBaseUrl("https://example.com/api");

		const state = await loadAuthState();
		assert.equal(state.token, "brd_pat_test");
		assert.equal(state.baseUrl, "https://example.com/api");

		const raw = await readFile(getConfigPath(), "utf8");
		assert.match(raw, /brd_pat_test/);

		await clearStoredToken();
		const cleared = await loadAuthState();
		assert.equal(cleared.token, undefined);
		assert.equal(cleared.baseUrl, "https://example.com/api");
	} finally {
		if (previousConfigHome === undefined) {
			delete process.env.XDG_CONFIG_HOME;
		} else {
			process.env.XDG_CONFIG_HOME = previousConfigHome;
		}
	}
});
