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
};

export type AuthenticatedUser = {
	id: string;
	username: string;
	globalName: string | null;
	avatarUrl: string | null;
};

export type PersonalAccessTokenRecord = {
	id: string;
	userId: string;
	name: string;
	tokenPrefix: string;
	scopes: string[];
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
	scopes: string[];
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
	dueAt: number | null;
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
	cardTemplates: Array<{
		id: string;
		boardId: string;
		name: string;
		title: string;
		description: string;
		labels: CardLabel[];
		position: number;
	}>;
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
	actorId: string | null;
	actorUsername: string | null;
	actorGlobalName: string | null;
	actorAvatarUrl: string | null;
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
