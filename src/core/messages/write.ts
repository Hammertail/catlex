//* Libraries imports
import { writeFile } from "node:fs/promises";

//* Types imports
import type { MessageTree } from "../types.ts";

/**
 * Writes a locale message tree as pretty-printed JSON with a trailing newline.
 */
export async function writeLocaleMessages(filePath: string, tree: MessageTree): Promise<void> {
  const contents = `${JSON.stringify(tree, null, 2)}\n`;
  await writeFile(filePath, contents, "utf8");
}
