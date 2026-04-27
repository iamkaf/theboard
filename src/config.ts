import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AuthState } from "./types.js";

type ConfigFile = {
	baseUrl?: string;
	token?: string;
	defaultBoard?: string;
};

export function getConfigDir() {
	return process.env.XDG_CONFIG_HOME
		? path.join(process.env.XDG_CONFIG_HOME, "board")
		: path.join(os.homedir(), ".config", "board");
}

export function getConfigPath() {
	return path.join(getConfigDir(), "config.json");
}

async function readConfigFile(): Promise<ConfigFile> {
	try {
		const raw = await readFile(getConfigPath(), "utf8");
		return JSON.parse(raw) as ConfigFile;
	} catch (error) {
		if (isMissingFileError(error)) {
			return {};
		}

		throw error;
	}
}

async function writeConfigFile(config: ConfigFile) {
	await mkdir(getConfigDir(), { recursive: true });
	await writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function loadAuthState(overrides: AuthState = {}): Promise<AuthState> {
	const fileConfig = await readConfigFile();

	return {
		baseUrl:
			overrides.baseUrl ??
			process.env.BOARD_BASE_URL ??
			fileConfig.baseUrl ??
			"https://board.kaf.sh/api",
		token: overrides.token ?? process.env.BOARD_TOKEN ?? fileConfig.token,
		defaultBoard: overrides.defaultBoard ?? process.env.BOARD_DEFAULT_BOARD ?? fileConfig.defaultBoard,
	};
}

export async function setStoredToken(token: string) {
	const current = await readConfigFile();
	await writeConfigFile({
		...current,
		token,
	});
}

export async function clearStoredToken() {
	const current = await readConfigFile();

	if (!current.baseUrl) {
		await rm(getConfigPath(), { force: true });
		return;
	}

	await writeConfigFile({
		baseUrl: current.baseUrl,
	});
}

export async function setStoredBaseUrl(baseUrl: string) {
	const current = await readConfigFile();
	await writeConfigFile({
		...current,
		baseUrl,
	});
}

export async function getStoredDefaultBoard() {
	const current = await readConfigFile();
	return current.defaultBoard;
}

export async function setStoredDefaultBoard(board: string) {
	const current = await readConfigFile();
	await writeConfigFile({
		...current,
		defaultBoard: board,
	});
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
