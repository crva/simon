import { execSync } from "child_process";
import { config } from "../config";
import { logger } from "../utils";
import { COMMAND_PROMPT } from "./command-prompt";

const ACTIONS = ["play", "skip", "pause", "resume", "stop", "message", "none"] as const;
export type CommandAction = (typeof ACTIONS)[number];

export interface ParsedCommand {
  action: CommandAction;
  query: string | null;
  channel: string | null;
}

const NONE_COMMAND: ParsedCommand = { action: "none", query: null, channel: null };

let cachedBaseUrl: string | null = null;

// WSL2's NAT gateway IP can change across reboots, so resolve it at runtime
// instead of hardcoding it; override with OLLAMA_BASE_URL if needed (e.g.
// mirrored networking mode, where plain localhost works).
function resolveBaseUrl(): string {
  if (config.llm.baseUrl) return config.llm.baseUrl;
  if (cachedBaseUrl) return cachedBaseUrl;

  try {
    const gateway = execSync("ip route | awk '/default/ {print $3}'").toString().trim();
    cachedBaseUrl = `http://${gateway}:11434`;
  } catch (error) {
    logger.error({ err: error }, "❌ Failed to resolve Ollama host, falling back to localhost");
    cachedBaseUrl = "http://localhost:11434";
  }
  return cachedBaseUrl;
}

function parseModelOutput(raw: string): ParsedCommand {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return NONE_COMMAND;

  try {
    const parsed = JSON.parse(match[0]);
    if (!ACTIONS.includes(parsed.action)) return NONE_COMMAND;

    return {
      action: parsed.action,
      query: typeof parsed.query === "string" ? parsed.query : null,
      channel: typeof parsed.channel === "string" ? parsed.channel : null,
    };
  } catch {
    return NONE_COMMAND;
  }
}

/**
 * Sends a (Whisper-transcribed) utterance to a small local LLM via Ollama
 * to extract the intended command, regardless of phrasing/word order.
 */
export async function parseCommand(transcript: string): Promise<ParsedCommand> {
  const prompt = COMMAND_PROMPT.replace("{{PHRASE}}", transcript);
  const controller = new AbortController();
  // Generous margin for a cold model load (normally avoided by ollama-init's
  // warmup, but still possible after Ollama restarts or evicts the model).
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${resolveBaseUrl()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.llm.model,
        prompt,
        stream: false,
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.error(`❌ Ollama request failed with status ${response.status}`);
      return NONE_COMMAND;
    }

    const data = (await response.json()) as { response: string };
    const parsed = parseModelOutput(data.response);
    logger.debug({ transcript, parsed }, "🧠 LLM command parsed");
    return parsed;
  } catch (error) {
    logger.error({ err: error }, "❌ Failed to parse command via LLM");
    return NONE_COMMAND;
  } finally {
    clearTimeout(timeout);
  }
}
