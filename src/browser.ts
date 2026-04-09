import { spawn } from "node:child_process";

export async function openBrowser(url: string) {
	const platform = process.platform;

	if (platform === "darwin") {
		return launch("open", [url]);
	}

	if (platform === "win32") {
		return launch("cmd", ["/c", "start", "", url]);
	}

	return launch("xdg-open", [url]);
}

function launch(command: string, args: string[]) {
	return new Promise<boolean>((resolve) => {
		try {
			const child = spawn(command, args, {
				stdio: "ignore",
				detached: true,
			});
			let settled = false;
			const finish = (value: boolean) => {
				if (settled) {
					return;
				}

				settled = true;
				resolve(value);
			};

			child.once("error", () => finish(false));
			child.once("spawn", () => {
				child.unref();
				finish(true);
			});
		} catch {
			resolve(false);
		}
	});
}
