import { randomBytes } from "node:crypto";
import os from "node:os";

import { BoardApiClient, BoardApiError } from "./api.js";
import { openBrowser } from "./browser.js";
import { startCallbackServer } from "./callback-server.js";
import { getConfigPath, setStoredToken } from "./config.js";
import type { CliIo, OutputMode } from "./output.js";
import { print } from "./output.js";
import { CLI_VERSION } from "./version.js";
const LOGIN_TIMEOUT_MS = 1000 * 60 * 10;

export async function loginWithBrowser(input: {
	baseUrl: string;
	io: CliIo;
	outputMode: OutputMode;
}) {
	const api = new BoardApiClient({
		baseUrl: input.baseUrl,
	});
	const callbackServer = await startCallbackServer();
	const state = randomToken(24);
	const codeVerifier = randomToken(48);
	const codeChallenge = await buildCodeChallenge(codeVerifier);

	try {
		const started = await api.startCliAuthorization({
			state,
			codeChallenge,
			redirectUri: callbackServer.redirectUri,
			client: {
				name: "board",
				version: CLI_VERSION,
				hostname: safeHostname(),
				platform: process.platform,
			},
		});

		const browserOpened = await openBrowser(started.authorization.authorizeUrl);

		if (!browserOpened) {
			input.io.stdout.write(
				[
					"Could not open your browser automatically.",
					"Open this URL to continue:",
					started.authorization.authorizeUrl,
					"",
				].join("\n"),
			);
		} else {
			input.io.stdout.write("Opening your browser for The Board CLI login…\n");
		}

		const callback = await callbackServer.waitForCallback(LOGIN_TIMEOUT_MS);

		if (callback.state !== state) {
			throw new Error("CLI login failed due to a state mismatch.");
		}

		if ("error" in callback) {
			if (callback.error === "access_denied") {
				throw new Error("Authorization cancelled.");
			}

			throw new Error(`Authorization failed: ${callback.error}`);
		}

		const exchange = await api.exchangeCliAuthorization(callback.authorizationId, {
			code: callback.code,
			codeVerifier,
		});

		await setStoredToken(exchange.secret);

		if (input.outputMode === "json") {
			print(
				input.io,
				{
					ok: true,
					baseUrl: input.baseUrl,
					configPath: getConfigPath(),
					user: exchange.user,
					token: exchange.token,
				},
				"json",
			);
		} else {
			input.io.stdout.write(
				[
					`Authenticated as ${exchange.user.globalName || exchange.user.username}.`,
					`Token expires ${formatDate(exchange.token.expiresAt)}.`,
					`Stored token in ${getConfigPath()}.`,
				].join("\n") + "\n",
			);
		}
	} catch (error) {
		if (
			error instanceof BoardApiError &&
			(error.status === 410 || error.message.includes("expired"))
		) {
			throw new Error("Authorization expired. Run `board login` again.");
		}

		throw error;
	} finally {
		await callbackServer.close();
	}
}

function randomToken(byteLength: number) {
	return randomBytes(byteLength)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

async function buildCodeChallenge(codeVerifier: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));

	return Buffer.from(digest)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function safeHostname() {
	try {
		return os.hostname() || null;
	} catch {
		return null;
	}
}

function formatDate(timestamp: number | null) {
	if (!timestamp) {
		return "never";
	}

	return new Date(timestamp).toLocaleString();
}
