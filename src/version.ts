import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const CLI_VERSION = require("../../package.json").version as string;
