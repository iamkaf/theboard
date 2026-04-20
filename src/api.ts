import type {
	ApiInfo,
	AuthenticatedUser,
	BoardDetail,
	BoardSummary,
	CardActivityRecord,
	CardRecord,
	CliAuthorizationRecord,
	JsonValue,
	PersonalAccessTokenRecord,
} from "./types.js";

export class BoardApiError extends Error {
	readonly status: number;
	readonly payload: JsonValue | null;

	constructor(message: string, status: number, payload: JsonValue | null) {
		super(message);
		this.name = "BoardApiError";
		this.status = status;
		this.payload = payload;
	}
}

type RequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

type FetchLike = typeof fetch;

export type BoardApiClientOptions = {
	baseUrl: string;
	token?: string | undefined;
	fetchFn?: FetchLike | undefined;
};

export class BoardApiClient {
	readonly baseUrl: string;
	private readonly token: string | undefined;
	private readonly fetchFn: FetchLike;

	constructor(options: BoardApiClientOptions) {
		this.baseUrl = normalizeBaseUrl(options.baseUrl);
		this.token = options.token;
		this.fetchFn = options.fetchFn ?? fetch;
	}

	info() {
		return this.request<ApiInfo>("");
	}

	health() {
		return this.request<JsonValue>("/health");
	}

	listBoards() {
		return this.request<{ ok: true; boards: BoardSummary[] }>("/boards");
	}

	getBoard(boardId: string) {
		return this.request<{ ok: true } & BoardDetail>(`/boards/${encodeURIComponent(boardId)}`);
	}

	getCard(boardId: string, cardId: string) {
		return this.request<{ ok: true; card: CardRecord }>(
			`/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`,
		);
	}

	startCliAuthorization(input: {
		state: string;
		codeChallenge: string;
		redirectUri: string;
		client: {
			name: "board";
			version: string;
			hostname: string | null;
			platform: string | null;
		};
	}) {
		return this.request<{
			ok: true;
			authorization: {
				id: string;
				authorizeUrl: string;
				expiresAt: number;
				scopes: string[];
				tokenExpiresAt: number;
				client: CliAuthorizationRecord["client"];
			};
		}>("/cli/authorizations", {
			method: "POST",
			body: input,
		});
	}

	exchangeCliAuthorization(
		authorizationId: string,
		input: {
			code: string;
			codeVerifier: string;
		},
	) {
		return this.request<{
			ok: true;
			secret: string;
			token: PersonalAccessTokenRecord;
			user: AuthenticatedUser;
		}>(`/cli/authorizations/${encodeURIComponent(authorizationId)}/exchange`, {
			method: "POST",
			body: input,
		});
	}

	createCard(
		boardId: string,
		input: {
			listId: string;
			title: string;
			description?: string;
			labelIds?: string[];
			epicId?: string | null;
		},
	) {
		return this.request<{ ok: true; card: CardRecord }>(
			`/boards/${encodeURIComponent(boardId)}/cards`,
			{
				method: "POST",
				body: {
					listId: input.listId,
					title: input.title,
					description: input.description ?? "",
					labelIds: input.labelIds ?? [],
					...(input.epicId !== undefined ? { epicId: input.epicId } : {}),
				},
			},
		);
	}

	updateCard(
		boardId: string,
		cardId: string,
		input: {
			title?: string;
			description?: string;
			labelIds?: string[];
			assigneeUserId?: string | null;
			epicId?: string | null;
			dueAt?: number | null;
		},
	) {
		return this.request<{ ok: true; card: CardRecord | null }>(
			`/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`,
			{
				method: "PATCH",
				body: input,
			},
		);
	}

	moveCard(boardId: string, cardId: string, input: { listId: string; index: number }) {
		return this.request<{ ok: true; card: CardRecord | null; cards: CardRecord[] }>(
			`/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/move`,
			{
				method: "PATCH",
				body: input,
			},
		);
	}

	addComment(boardId: string, cardId: string, input: { message: string }) {
		return this.request<{ ok: true; activity: CardActivityRecord }>(
			`/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/comments`,
			{
				method: "POST",
				body: input,
			},
		);
	}

	private async request<T extends JsonValue>(
		pathname: string,
		input: {
			method?: RequestMethod;
			body?: JsonValue;
		} = {},
	): Promise<T> {
		const headers = new Headers({
			accept: "application/json",
		});

		if (this.token) {
			headers.set("authorization", `Bearer ${this.token}`);
		}

		let body: string | undefined;

		if (input.body !== undefined) {
			headers.set("content-type", "application/json");
			body = JSON.stringify(input.body);
		}

		const response = await this.fetchFn(`${this.baseUrl}${pathname}`, {
			method: input.method ?? "GET",
			headers,
			...(body ? { body } : {}),
		});
		const text = await response.text();
		const payload = text ? (JSON.parse(text) as JsonValue) : null;

		if (!response.ok) {
			throw new BoardApiError(
				extractErrorMessage(payload) ?? `Request failed with status ${response.status}`,
				response.status,
				payload,
			);
		}

		return payload as T;
	}
}

function normalizeBaseUrl(value: string) {
	return value.replace(/\/+$/, "");
}

function extractErrorMessage(payload: JsonValue | null) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return null;
	}

	const candidate = payload.error;
	return typeof candidate === "string" ? candidate : null;
}
