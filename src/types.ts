export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export type AuthState = {
	token?: string | undefined;
	baseUrl?: string | undefined;
	defaultBoard?: string | undefined;
};

export type AuthenticatedUser = {
	id: string;
	username: string;
	globalName: string | null;
	avatarUrl: string | null;
};

export type PersonalAccessTokenScope =
	| "boards:read"
	| "boards:write"
	| "tokens:read"
	| "tokens:write";

export type PersonalAccessTokenRecord = {
	id: string;
	userId: string;
	name: string;
	tokenPrefix: string;
	scopes: PersonalAccessTokenScope[];
	boardIds: string[] | null;
	createdAt: number;
	lastUsedAt: number | null;
	expiresAt: number | null;
	revokedAt: number | null;
};

export type CliAuthorizationStatus =
	| "pending"
	| "approved"
	| "completed"
	| "expired"
	| "cancelled";

export type CliAuthorizationRecord = {
	id: string;
	status: CliAuthorizationStatus;
	expiresAt: number;
	scopes: PersonalAccessTokenScope[];
	tokenExpiresAt: number;
	redirectUri: string;
	state: string;
	client: {
		name: string;
		version: string | null;
		hostname: string | null;
		platform: string | null;
	};
};

export type BoardSummary = {
	id: string;
	slug: string;
	code: string;
	name: string;
	description: string;
	visibility: "private" | "public";
	allowPublicComments?: boolean | number;
	epicCompletionListId?: string | null;
	role: "owner" | "admin" | "member" | null;
	position: number;
	updatedAt: number;
};

export type CardLabel = {
	id: string;
	color: string;
	text: string;
};

export type ListRecord = {
	id: string;
	boardId: string;
	title: string;
	position: number;
};

export type CardRecord = {
	id: string;
	boardId: string;
	listId: string;
	number: number;
	identifier: string;
	title: string;
	description: string;
	labels: CardLabel[];
	position: number;
	assigneeUserId: string | null;
	epicId: string | null;
	dueAt: number | null;
	blockedAt?: number | null;
	blockedReason?: string;
	blockedByUserId?: string | null;
};

export type CardWithList = CardRecord & {
	listTitle?: string | null | undefined;
};

export type EpicRecord = {
	id: string;
	boardId: string;
	name: string;
	description: string;
	color: string;
	status?: "planned" | "active" | "paused" | "completed" | "canceled";
	ownerUserId?: string | null;
	startAt?: number | null;
	targetAt?: number | null;
	completedAt?: number | null;
	archivedAt?: number | null;
	position: number;
};

export type CardTemplateRecord = {
	id: string;
	boardId: string;
	name: string;
	title: string;
	description: string;
	labels: CardLabel[];
	position: number;
};

export type CardLinkRecord = {
	id: string;
	boardId: string;
	sourceCardId: string;
	targetCardId: string;
	relation: "blocks" | "blocked_by" | "relates_to";
	createdAt: number;
};

export type BoardDetail = {
	board: BoardSummary;
	boardMembers: Array<{
		id: string;
		username: string;
		globalName: string | null;
		avatarUrl: string | null;
	}>;
	boardLabels: CardLabel[];
	epics: EpicRecord[];
	cardTemplates: CardTemplateRecord[];
	lists: ListRecord[];
	cards: CardRecord[];
};

export type CardActivityRecord = {
	id: string;
	boardId: string;
	cardId: string;
	kind: string;
	message: string;
	createdAt: number;
	actor: {
		id: string;
		username: string;
		globalName: string | null;
		avatarUrl: string | null;
	} | null;
};

export type ApiInfo = {
	ok: true;
	name: string;
	version: string;
	requestId: string;
	auth: {
		discord: boolean;
		personalAccessTokens: boolean;
	};
};
