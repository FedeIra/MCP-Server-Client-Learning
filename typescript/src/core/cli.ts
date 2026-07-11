import process from "node:process";
import termkit from "terminal-kit";
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import { CliChat } from "./cliChat.js";

const term = termkit.terminal;

// Array of completion candidates. terminal-kit prepends `.prefix` to whatever
// the user selects, so menu items can stay short (just the candidate) while the
// text typed before the trigger ("@"/"/") is preserved in the final result.
type CompletionArray = string[] & { prefix?: string; postfix?: string };

// Terminal interface. Equivalent to `core/cli.py`.
//
// Python's version uses `prompt-toolkit`, whose menu appears automatically on every
// keystroke. No Node library replicates that for free; the closest real equivalent is
// terminal-kit's `inputField` with `autoCompleteMenu`, which shows a navigable menu of
// matches when Tab is pressed (still Tab-triggered, but with an actual selectable menu
// instead of plain text substitution).
export class CliApp {
  private agent: CliChat;
  private resources: string[] = [];
  private prompts: Prompt[] = [];

  constructor(agent: CliChat) {
    this.agent = agent;
  }

  async initialize(): Promise<void> {
    await this.refreshResources();
    await this.refreshPrompts();
  }

  async refreshResources(): Promise<void> {
    try {
      this.resources = await this.agent.listDocsIds();
    } catch (error) {
      console.log(`Error refreshing resources: ${error}`);
    }
  }

  async refreshPrompts(): Promise<void> {
    try {
      this.prompts = await this.agent.listPrompts();
    } catch (error) {
      console.log(`Error refreshing prompts: ${error}`);
    }
  }

  // Tab-completer: "@partial" -> resource ids, "/partial" -> command names,
  // "/command partial" -> resource ids for the command's doc_id argument.
  private completer = async (
    inputString: string
  ): Promise<string | CompletionArray> => {
    const atIndex = inputString.lastIndexOf("@");
    if (atIndex !== -1 && !inputString.slice(atIndex).includes(" ")) {
      const prefix = inputString.slice(0, atIndex + 1);
      const partial = inputString.slice(atIndex + 1);
      const pool = this.resources.filter((id) =>
        id.toLowerCase().startsWith(partial.toLowerCase())
      );
      const candidates = pool.length ? pool : this.resources;
      if (candidates.length === 1) {
        return prefix + candidates[0];
      }
      const arr: CompletionArray = [...candidates];
      arr.prefix = prefix;
      return arr;
    }

    if (inputString.startsWith("/")) {
      if (!inputString.includes(" ")) {
        const partial = inputString.slice(1);
        const names = this.prompts.map((p) => p.name);
        const pool = names.filter((name) => name.startsWith(partial));
        const candidates = pool.length ? pool : names;
        if (candidates.length === 1) {
          return "/" + candidates[0];
        }
        const arr: CompletionArray = [...candidates];
        arr.prefix = "/";
        return arr;
      }

      const lastSpace = inputString.lastIndexOf(" ");
      const prefix = inputString.slice(0, lastSpace + 1);
      const partial = inputString.slice(lastSpace + 1);
      const pool = this.resources.filter((id) => id.startsWith(partial));
      const candidates = pool.length ? pool : this.resources;
      if (candidates.length === 1) {
        return prefix + candidates[0];
      }
      const arr: CompletionArray = [...candidates];
      arr.prefix = prefix;
      return arr;
    }

    return inputString;
  };

  async run(): Promise<void> {
    // terminal-kit puts stdin in raw mode, so Ctrl+C must be handled explicitly.
    term.on("key", (name: string) => {
      if (name === "CTRL_C") {
        term.grabInput(false);
        setTimeout(() => process.exit(0), 100);
      }
    });

    while (true) {
      term.cyan("> ");
      const userInput = await term.inputField({
        autoComplete: this.completer,
        autoCompleteMenu: true,
        autoCompleteHint: true,
      }).promise;
      term("\n");

      if (userInput === undefined || !userInput.trim()) {
        continue;
      }

      const response = await this.agent.run(userInput);
      console.log(`\nResponse:\n${response}`);
    }
  }
}
