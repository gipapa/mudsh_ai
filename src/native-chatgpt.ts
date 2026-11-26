import { execFile, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import type { SpriteHistory } from "./sprite.ts";
import { defaultSpriteOptions } from "./sprite-options.ts";

const credentialStore = ["-c",'cli_auth_credentials_store="auto"'];
const options = {...defaultSpriteOptions, name:"ChatGPT", timeoutSeconds:90};

function checkLogin() {
  const status = spawnSync("codex",["login","status",...credentialStore],{encoding:"utf8",timeout:10000});
  if (status.error) {
    if ((status.error as NodeJS.ErrnoException).code === "ENOENT")
      throw Error("Install the OpenAI Codex CLI (npm install -g @openai/codex) to use ChatGPT.");
    throw Error("Could not check the Codex login. Run codex login status.");
  }
  return status.status === 0 && /logged in (?:using|with) chatgpt\b/i.test(status.stdout + status.stderr);
}

export function chatGPTLogin(command: string, args: string[]) {
  const device = args.length === 1 && args[0] === "--device-auth";
  if ((command !== "login" && command !== "status") || (args.length && !(command === "login" && device)))
    throw Error("Use mudsh chatgpt [login [--device-auth] | status].");
  if (!checkLogin()) {
    if (command === "status") throw Error("ChatGPT is disconnected. Run mudsh chatgpt login.");
    const result = spawnSync("codex",["login",...args,...credentialStore],{stdio:"inherit"});
    if (result.status !== 0 || !checkLogin()) throw Error("ChatGPT sign-in did not complete.");
  }
  console.log("Signed in with ChatGPT. Run mudsh chatgpt to open the local shell.");
}

export function chatGPTProvider() {
  if (!checkLogin()) throw Error("Run mudsh chatgpt login to sign in with ChatGPT.");
  return {options, respond};
}

function respond(messages: SpriteHistory): Promise<string> {
  // Codex manages its own login cache and refresh. Send turn data over stdin only.
  const args = ["exec","--ignore-user-config","--ephemeral","--skip-git-repo-check","--sandbox","read-only",
    "--disable","shell_tool","--disable","plugins","--disable","apps","--disable","hooks",
    "-c","agents.enabled=false",...credentialStore,
    "-c",'model_provider="openai"',"-c",'forced_login_method="chatgpt"',
    "-c",'web_search="disabled"',"-c",'approval_policy="never"',"-"];
  const input = "Respond to the following conversation using its system instructions. " +
    "Return only the requested reply. mudsh executes any requested shell action.\n" + JSON.stringify(messages);
  return new Promise((resolve,reject) => {
    const proc = execFile("codex",args,{cwd:tmpdir(),timeout:options.timeoutSeconds * 1000,maxBuffer:1024*1024},
      (error,stdout) => {
        if (error) reject(Error(error.killed ? "ChatGPT request timed out" :
          "Codex could not complete the request. Check mudsh chatgpt status and your plan usage"));
        else if (!stdout.trim()) reject(Error("ChatGPT returned an empty reply"));
        else resolve(stdout.trim());
      });
    // execFile reports startup failures and early exits through its callback.
    proc.stdin!.on("error",() => {});
    proc.stdin!.end(input);
  });
}
