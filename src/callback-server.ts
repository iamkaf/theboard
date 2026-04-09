import type { AddressInfo } from "node:net";
import { createServer } from "node:http";

export type CallbackSuccess = {
	authorizationId: string;
	code: string;
	state: string;
};

export type CallbackCancelled = {
	authorizationId: string;
	error: string;
	state: string;
};

export type CallbackResult = CallbackSuccess | CallbackCancelled;

export async function startCallbackServer() {
	const callbackPath = "/cli/callback";
	let callbackResolve!: (value: CallbackResult) => void;
	let callbackReject!: (reason?: unknown) => void;
	let settled = false;

	const callbackPromise = new Promise<CallbackResult>((resolve, reject) => {
		callbackResolve = resolve;
		callbackReject = reject;
	});

	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");

		if (url.pathname !== callbackPath) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end("Not found");
			return;
		}

		const authorizationId = url.searchParams.get("authorizationId");
		const state = url.searchParams.get("state");
		const code = url.searchParams.get("code");
		const error = url.searchParams.get("error");

		if (!authorizationId || !state || (!code && !error)) {
			response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
			response.end(renderHtml("Login failed", "The callback was missing required parameters."));
			return;
		}

		if (error) {
			response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			response.end(renderHtml("Authorization cancelled", "You can return to the terminal."));
			settle({
				authorizationId,
				error,
				state,
			});
			return;
		}

		if (!code) {
			response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
			response.end(renderHtml("Login failed", "The callback code was missing."));
			return;
		}

		response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		response.end(renderHtml("CLI authenticated", "The Board CLI is authenticated. You can return to the terminal."));
		settle({
			authorizationId,
			code,
			state,
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});

	const address = server.address();

	if (!address || typeof address === "string") {
		throw new Error("Could not determine callback server address");
	}

	return {
		redirectUri: `http://127.0.0.1:${(address as AddressInfo).port}${callbackPath}`,
		waitForCallback(timeoutMs: number) {
			return new Promise<CallbackResult>((resolve, reject) => {
				const timeout = setTimeout(() => {
					callbackReject(new Error("CLI login timed out waiting for the browser callback."));
				}, timeoutMs);

				callbackPromise.then(
					(value) => {
						clearTimeout(timeout);
						resolve(value);
					},
					(error) => {
						clearTimeout(timeout);
						reject(error);
					},
				);
			});
		},
		async close() {
			if (!server.listening) {
				return;
			}

			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			});
		},
	};

	function settle(result: CallbackResult) {
		if (settled) {
			return;
		}

		settled = true;
		callbackResolve(result);
		void server.close();
	}
}

function renderHtml(title: string, body: string) {
	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: #f6f6f1;
        color: #141414;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      section {
        width: min(100%, 560px);
        background: #ffffff;
        border: 1px solid #d8d8cf;
        border-radius: 28px;
        padding: 32px;
        box-shadow: 0 12px 28px rgba(20, 20, 20, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: #5a5a52;
        font-size: 15px;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(body)}</p>
      </section>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
