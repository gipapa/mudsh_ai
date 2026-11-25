import { runAgentLoop, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import { Type, type Model } from "@earendil-works/pi-ai";
import { stream } from "@earendil-works/pi-ai/api/openai-completions";
import {
  completionURL, describe429, recentHistory, rememberTurn, roomContext, runSpriteShell, spriteIdentity, spriteShellInstructions,
  type Progress, type SpriteConfig, type SpriteHistory, type SpriteTurnResult,
} from "./sprite.ts";
import { defaultSpriteOptions } from "./sprite-options.ts";
import type { Expedition } from "./world.ts";

const instructions = `Use the shell tool only to carry out the player's request in this virtual world.
Use tool results to decide what to do next. Verify the goal when useful, then reply briefly with the result.
If you cannot achieve the goal, explain what you tried and what prevented completion.
Set show=true when the player asks to read a file or see original command output.`;

const shellParameters = Type.Object({
  script: Type.String({ minLength: 1, maxLength: 8192 }),
  show: Type.Optional(Type.Boolean()),
});

export async function playAdvancedTurn(game: Expedition, line: string, config: SpriteConfig,
  progress: Progress, history: SpriteHistory): Promise<SpriteTurnResult> {
  const options = config.options ?? defaultSpriteOptions;
  const deadline = AbortSignal.timeout(options.deadlineSeconds * 1000);
  const baseUrl = completionURL(config.endpoint).replace(/\/chat\/completions$/, "");
  const model: Model<"openai-completions"> = {
    id: config.model, name: config.model, api: "openai-completions", provider: "mudsh",
    baseUrl, reasoning: !!options.effort, input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000, maxTokens: options.maxTokens || 4096,
    compat: { supportsDeveloperRole: false, maxTokensField: "max_completion_tokens" },
  };
  let actions = 0, requests = 0;
  let reachedLimit = false, providerFailure = "", lastOutput = "";
  const result = (text: string) => ({ content: [{
    type: "text" as const,
    text: text.length <= options.toolResultChars ? text : text.slice(0,options.toolResultChars) + "\n[Output truncated]",
  }], details: null });
  const shell: AgentTool<typeof shellParameters> = {
    name: "shell", label: "Shell",
    description: "Run a shell script such as cd, ls or cat in the virtual filesystem. Provide the script without a prompt prefix. Use show=true to print raw output.",
    parameters: shellParameters,
    async execute(_id, {script, show}) {
      deadline.throwIfAborted();
      const previousPath = game.cwd;
      const executed = await runSpriteShell(game,script,progress);
      const raw = executed.stdout + executed.stderr;
      lastOutput = show ? "" : raw;
      if (show) progress("output",raw);
      const room = previousPath === game.cwd ? undefined : await roomContext(game,options.roomEntries).catch(()=>undefined);
      return result(`Exit ${executed.exitCode}. Current path: ${executed.cwd}\n${raw}`
        + (room ? "\nCurrent room: " + JSON.stringify(room) : ""));
    },
  };
  const streamFn: StreamFn = (_model, context, request) => {
    requests++;
    progress("thinking");
    const requestSignal = AbortSignal.any([deadline, AbortSignal.timeout(options.timeoutSeconds * 1000)]);
    return stream(model,context,{
      ...request,
      apiKey: config.key || "local-provider",
      signal: requestSignal,
      maxRetries: 0,
      maxTokens: options.maxTokens || undefined,
      temperature: options.temperature,
      samplingParams: options.effort ? { reasoning_effort: options.effort } : undefined,
      async fetch(resource, init) {
        const headers = new Headers(init?.headers ?? (resource instanceof Request ? resource.headers : undefined));
        if (!config.key) headers.delete("Authorization");
        try {
          const response = await fetch(resource,{...init,headers,credentials:"omit",redirect:"error"});
          if (response.status === 429) providerFailure = (await describe429(response.clone())) + ".";
          else if (!response.ok) providerFailure = `Provider returned HTTP ${response.status}.`;
          return response;
        } catch (error) {
          providerFailure = requestSignal.aborted ? "The model request timed out." : "Could not reach the provider.";
          throw error;
        }
      },
    });
  };

  try {
    const now = Date.now();
    const room = await roomContext(game,options.roomEntries);
    const messages = await runAgentLoop(
      [{role:"user",content:JSON.stringify({request:line,region:game.scene.name,room}),timestamp:now}],
      {
        systemPrompt: [spriteIdentity(options),spriteShellInstructions,instructions,options.instructions].filter(Boolean).join("\n\n"),
        messages: recentHistory(history,options).map(message =>
          message.role === "user" ? {role:"user",content:message.content,timestamp:now} :
            {role:"assistant",content:[{type:"text",text:message.content}],timestamp:now,
              api:model.api,provider:model.provider,model:model.id,stopReason:"stop",
              usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}),
        tools: [shell],
      },
      {
        model, convertToLlm: items => items.filter(item =>
          item.role === "user" || item.role === "assistant" || item.role === "toolResult"),
        toolExecution: "sequential",
        beforeToolCall: async () => {
          if (game.ended || deadline.aborted) return {block:true,terminate:true,reason:"The expedition or goal ended."};
          if (actions >= options.maxSteps) {
            reachedLimit = true;
            return {block:true,terminate:true,reason:"Action limit reached. Report the result to the player."};
          }
          actions++;
        },
        shouldStopAfterTurn: ({message}) => game.ended || deadline.aborted || message.stopReason === "length" ||
          (requests >= options.maxSteps + 1 && message.content.some(part => part.type === "toolCall")),
      },
      () => {},
      deadline,
      streamFn,
    );
    const last = messages.findLast(message => message.role === "assistant");
    if (last?.stopReason === "error" || last?.stopReason === "aborted")
      return failure(deadline.aborted ? "Goal timed out." : providerFailure || "The provider could not complete the goal.",true);
    if (game.ended) return {output:"Expedition closed."};
    if (deadline.aborted) return failure("Goal timed out.");
    if (last?.stopReason === "length") return failure("The response reached the completion token limit.");
    const text = last?.content.flatMap(part => part.type === "text" ? [part.text] : []).join("").trim();
    if (last?.stopReason !== "stop" || !text)
      return failure(reachedLimit || requests >= options.maxSteps + 1 ? "Goal stopped at the action limit." : "The sprite did not provide a final result.");
    rememberTurn(history,options,line,text);
    return {output:text};
  } catch {
    return failure(deadline.aborted ? "Goal timed out." : providerFailure || "The sprite could not finish the goal.",true);
  }

  function failure(reason: string, offline = false) {
    const progressMessage = actions ? "Completed actions remain in the expedition." : "No action ran.";
    const status = offline ? ` ${options.name} is offline.` : "";
    return {offline,output:`${reason}${status} ${progressMessage}` + (lastOutput ? "\n" + lastOutput : "")};
  }
}
