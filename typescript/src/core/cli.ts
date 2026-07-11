import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import { CliChat } from "./cliChat.js";

// Terminal interface. Equivalent to `core/cli.py`.
//
// NOTE: the Python version uses `prompt-toolkit` for rich "@" / "/" autocompletion.
// To keep this port dependency-free (SDKs only) we use Node's built-in `readline`.
// Typing "@doc" and "/command" still works; the popup autocompletion is the piece
// that would need an extra library (e.g. @clack/prompts or inquirer) to replicate.
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

  async run(): Promise<void> {
    const rl = readline.createInterface({ input, output });
    try {
      while (true) {
        const userInput = await rl.question("> ");
        if (!userInput.trim()) {
          continue;
        }

        const response = await this.agent.run(userInput);
        console.log(`\nResponse:\n${response}`);
      }
    } catch {
      // readline throws on Ctrl+C / EOF (SIGINT) -> exit the loop gracefully.
    } finally {
      rl.close();
    }
  }
}
