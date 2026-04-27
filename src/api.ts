import type {
	ApiInfo,
	AuthenticatedUser,
	BoardDetail,
	BoardSummary,
	CardActivityRecord,
	CardLabel,
	CardLinkRecord,
	CardRecord,
	CardTemplateRecord,
	CliAuthorizationRecord,
	EpicRecord,
	JsonValue,
	ListRecord,
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

	createBoard(input: {
		name: string;
		code: string;
		description?: string;
		visibility?: "private" | "public";
		templateId?: string;
	}) {
		return this.request<{ ok: true; board: BoardSummary }>("/boards", {
			method: "POST",
			body: {
				name: input.name,
				code: input.code,
				description: input.description ?? "",
				visibility: input.visibility ?? "private",
				...(input.templateId ? { templateId: input.templateId } : {}),
			},
		});
	}

	updateBoard(
		boardIdentifier: string,
		input: Partial<{
			name: string;
			code: string;
			description: string;
			visibility: "private" | "public";
			allowPublicComments: boolean;
			epicCompletionListId: string | null;
		}>,
	) {
		return this.request<{ ok: true; board: BoardSummary | null }>(
			`/boards/${encodeURIComponent(boardIdentifier)}`,
			{ method: "PATCH", body: input },
		);
	}

	reorderBoards(boardIds: string[]) {
		return this.request<{ ok: true; boards: BoardSummary[] }>("/boards/reorder", {
			method: "POST",
			body: { boardIds },
		});
	}

	archiveBoard(boardIdentifier: string) {
		return this.request<{ ok: true }>(`/boards/${encodeURIComponent(boardIdentifier)}/archive`, {
			method: "POST",
		});
	}

	deleteBoard(boardIdentifier: string) {
		return this.request<{ ok: true }>(`/boards/${encodeURIComponent(boardIdentifier)}`, {
			method: "DELETE",
		});
	}

	getBoard(boardIdentifier: string) {
		return this.request<{ ok: true } & BoardDetail>(
			`/boards/${encodeURIComponent(boardIdentifier)}`,
		);
	}

	getCard(boardIdentifier: string, cardId: string) {
		return this.request<{ ok: true; card: CardRecord }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}`,
		);
	}

	createList(boardIdentifier: string, input: { title: string }) {
		return this.request<{ ok: true; list: ListRecord }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/lists`,
			{ method: "POST", body: input },
		);
	}

	updateList(
		boardIdentifier: string,
		listId: string,
		input: Partial<{ title: string; newCardPlacement: "top" | "bottom" }>,
	) {
		return this.request<{ ok: true; list: ListRecord | null }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/lists/${encodeURIComponent(listId)}`,
			{ method: "PATCH", body: input },
		);
	}

	reorderLists(boardIdentifier: string, listIds: string[]) {
		return this.request<{ ok: true; lists: ListRecord[] }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/lists/reorder`,
			{ method: "POST", body: { listIds } },
		);
	}

	archiveList(boardIdentifier: string, listId: string) {
		return this.request<{ ok: true }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/lists/${encodeURIComponent(listId)}/archive`,
			{ method: "POST" },
		);
	}

	deleteList(boardIdentifier: string, listId: string) {
		return this.request<{ ok: true }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/lists/${encodeURIComponent(listId)}`,
			{ method: "DELETE" },
		);
	}

	createLabel(boardIdentifier: string, input: { text: string; color: string }) {
		return this.request<{ ok: true; label: CardLabel }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/labels`,
			{ method: "POST", body: input },
		);
	}

	updateLabel(boardIdentifier: string, labelId: string, input: { text: string; color: string }) {
		return this.request<{ ok: true; label: CardLabel }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/labels/${encodeURIComponent(labelId)}`,
			{ method: "PATCH", body: input },
		);
	}

	deleteLabel(boardIdentifier: string, labelId: string) {
		return this.request<{ ok: true }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/labels/${encodeURIComponent(labelId)}`,
			{ method: "DELETE" },
		);
	}

	listEpics(boardIdentifier: string) {
		return this.request<{ ok: true; epics: EpicRecord[] }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/epics`,
		);
	}

	createEpic(
		boardIdentifier: string,
		input: {
			name: string;
			description?: string;
			color?: string;
			status?: string;
			ownerUserId?: string | null;
			startAt?: number | null;
			targetAt?: number | null;
		},
	) {
		return this.request<{ ok: true; epic: EpicRecord }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/epics`,
			{ method: "POST", body: input },
		);
	}

	updateEpic(boardIdentifier: string, epicId: string, input: Record<string, JsonValue>) {
		return this.request<{ ok: true; epic: EpicRecord }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/epics/${encodeURIComponent(epicId)}`,
			{ method: "PATCH", body: input },
		);
	}

	archiveEpic(boardIdentifier: string, epicId: string) {
		return this.request<{ ok: true }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/epics/${encodeURIComponent(epicId)}/archive`,
			{ method: "POST" },
		);
	}

	deleteEpic(boardIdentifier: string, epicId: string) {
		return this.request<{ ok: true }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/epics/${encodeURIComponent(epicId)}`,
			{ method: "DELETE" },
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
		boardIdentifier: string,
		input: {
			listId: string;
			title: string;
			description?: string;
			labelIds?: string[];
			epicId?: string | null;
		},
	) {
		return this.request<{ ok: true; card: CardRecord }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards`,
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
		boardIdentifier: string,
		cardId: string,
		input: {
			title?: string;
			description?: string;
			labelIds?: string[];
			assigneeUserId?: string | null;
			epicId?: string | null;
			dueAt?: number | null;
			blocked?: boolean;
			blockedReason?: string;
		},
	) {
		return this.request<{ ok: true; card: CardRecord | null }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}`,
			{
				method: "PATCH",
				body: input,
			},
		);
	}

	moveCard(boardIdentifier: string, cardId: string, input: { listId: string; index: number }) {
		return this.request<{ ok: true; card: CardRecord | null; cards: CardRecord[] }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}/move`,
			{
				method: "PATCH",
				body: input,
			},
		);
	}

	addComment(boardIdentifier: string, cardId: string, input: { message: string }) {
		return this.request<{ ok: true; activity: CardActivityRecord }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}/comments`,
			{
				method: "POST",
				body: input,
			},
		);
	}

	getCardActivity(boardIdentifier: string, cardId: string) {
		return this.request<{ ok: true; activity: CardActivityRecord[] }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}/activity`,
		);
	}

	reorderCards(boardIdentifier: string, lists: Array<{ listId: string; cardIds: string[] }>) {
		return this.request<{ ok: true; cards: CardRecord[] }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/reorder`,
			{ method: "POST", body: { lists } },
		);
	}

	archiveCard(boardIdentifier: string, cardId: string) {
		return this.request<{ ok: true }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}/archive`,
			{ method: "POST" },
		);
	}

	deleteCard(boardIdentifier: string, cardId: string) {
		return this.request<{ ok: true }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}`,
			{ method: "DELETE" },
		);
	}

	createCardLink(
		boardIdentifier: string,
		cardId: string,
		input: { targetCardId: string; relation: "blocks" | "blocked_by" | "relates_to" },
	) {
		return this.request<{ ok: true; link: CardLinkRecord; cardLinks: CardLinkRecord[] }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}/links`,
			{ method: "POST", body: input },
		);
	}

	deleteCardLink(boardIdentifier: string, cardId: string, linkId: string) {
		return this.request<{ ok: true; cardLinks: CardLinkRecord[] }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/cards/${encodeURIComponent(cardId)}/links/${encodeURIComponent(linkId)}`,
			{ method: "DELETE" },
		);
	}

	createCardTemplate(
		boardIdentifier: string,
		input: { name: string; title: string; description?: string; labelIds?: string[] },
	) {
		return this.request<{ ok: true; template: CardTemplateRecord }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/templates`,
			{
				method: "POST",
				body: {
					name: input.name,
					title: input.title,
					description: input.description ?? "",
					labelIds: input.labelIds ?? [],
				},
			},
		);
	}

	createCardFromTemplate(boardIdentifier: string, templateId: string, input: { listId: string }) {
		return this.request<{ ok: true; card: CardRecord }>(
			`/boards/${encodeURIComponent(boardIdentifier)}/templates/${encodeURIComponent(templateId)}/cards`,
			{ method: "POST", body: input },
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
			"x-board-source": "cli",
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
