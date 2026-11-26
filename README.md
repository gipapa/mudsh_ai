# mudsh_ai

[Play the web demo](https://gipapa.github.io/mudsh_ai/). Explore **The Lantern Below**, a fixed route of 13 Shell puzzle rooms. Read each room's `objective.txt`, solve the task with real shell syntax, and submit a flag or verify an artifact. A correct answer opens the next room and reveals a short ending.

## Use mudsh locally

Use Bash on macOS or Linux and Node.js 24 with npm. If `npm ci` needs to compile `node-pty`, install the Xcode command-line tools on macOS or a C++ compiler, Make and Python 3 on Linux. For the isolated dungeon, also run Docker Engine or Docker Desktop.

```sh
./bin/mudsh install-deps
npm run build
./bin/mudsh                    # MUD shell in your current directory
./bin/mudsh build-image        # build once, then rebuild after game updates
./bin/mudsh play               # enter the dungeon in an isolated MUD shell
```

Run `npm link` from this repository to put `mudsh` on your PATH. At the MUD prompt, type `!` or `！` to edit and run a command in Bash. Tab uses Bash's Readline and programmable completions. Use Ctrl-Z to stop a foreground job, then `!jobs`, `!bg`, or `!fg` from the MUD prompt. Pipes, redirects, variables and directory changes work across turns. With the sprite active, bare input goes to the sprite. Offline, use `look`, `go DIRECTORY`, `back`, `read FILE`, `help`, or `quit`. In this mode, Tab also completes MUD verbs and paths for `go` and `read`.

In the dungeon, offline verbs include `hint`, `submit ANSWER`, `check`, `next`, `progress`, and `resume`. You can also run them as Bash commands, for example `!mudsh hint` and `!mudsh submit "$answer"`. Exit with `!exit` or Ctrl-D. Use `mudsh --bash` for an ordinary interactive Bash prompt and `mudsh play --bash` for one in the dungeon. Dungeon commands that require their own interactive terminal can use `mudsh play --bash`.

Dungeon mode runs as an unprivileged user in a Docker container. It has a read-only base image, no external network, dropped capabilities, and CPU, memory and process limits. It mounts a named Docker volume for the dungeon files and progress, plus a temporary filesystem. Host directories and the Docker socket are outside the container. The local mudsh process makes the sprite's API requests and sends its Bash commands into the container. Run `MUDSH_PROFILE=practice ./bin/mudsh play` to start or resume a separate save named `practice`.

### Configure local downloads and HTTP endpoints

Copy the repository's `.mudshrc` to `~/.mudshrc` and edit it before running the launcher. Keep `return 0` on the first line so that accidentally sourcing the file returns immediately. mudsh reads the following lines as literal `key=value` data. Use one setting per line, without shell quoting or variable expansion. Lines beginning with `#` are comments.

| Setting | Example | Effect |
| --- | --- | --- |
| `harbor_project` | `harbor.example.org/dockerhub/library` | `mudsh build-image` uses `harbor.example.org/dockerhub/library/node:24-bookworm-slim` as its base. Leave empty for the Docker Hub Node image. |
| `npm_registry` | `https://packages.example.org/npm/` | `./bin/mudsh install-deps` runs `npm ci` in this repository using that registry. Leave empty to use npm's own registry settings. |
| `allow_remote_http` | `true` | Permits HTTP AI endpoints on any host for the native sprite, including model discovery and both sprite modes. The default is `false`, which allows HTTPS and loopback HTTP. Restart mudsh after editing this setting. |

Use Docker and npm's usual login mechanisms for private registries. HTTP sends the sprite's API key and conversation in cleartext. The browser accepts HTTPS and loopback HTTP.

The terminal highlights the prompt in green, the sprite name in cyan, file and directory references in blue, and errors in red. Set `NO_COLOR=1` to disable mudsh's terminal colors. Piped mudsh output is plain text.

### Set mudsh as your login shell

Build the project in a directory you intend to keep. From that directory, run the login launcher once to try it, then register its absolute path and select it with `chsh`.

```sh
mudsh_login="$(pwd -P)/bin/login/mudsh"
"$mudsh_login"
grep -Fxq -- "$mudsh_login" /etc/shells || printf '%s\n' "$mudsh_login" | sudo tee -a /etc/shells
chsh -s "$mudsh_login"
```

Open a new login terminal to see the MUD prompt. `!shopt -q login_shell && echo "login shell"` confirms that Bash is running in login mode. The session loads `/etc/profile` and the first readable file among `~/.bash_profile`, `~/.bash_login` and `~/.profile`. To switch back from the MUD prompt, run `!chsh -s /bin/bash` or substitute the path of your previous shell, such as `/bin/zsh` on macOS.

### Connect the local sprite

```sh
./bin/mudsh sprite setup
./bin/mudsh sprite models
./bin/mudsh sprite set name Ember
./bin/mudsh sprite set mode advanced
./bin/mudsh sprite help
```

Setup offers OpenAI, Groq, and custom OpenAI-compatible APIs. You can fetch and select a model or type its ID. Simple mode chooses one action by default. Advanced mode uses Pi Core to act on command results in sequence and requires a model that supports streaming tool calls. Both modes display the sprite's name before its commands and reply. Use `/sprite off` to switch to MUD verbs and `/sprite on` to reload saved settings and reconnect. Rate limits interrupt the current turn and keep the sprite enabled.

Settings are shared by both local modes. The key is stored in plain text in `${XDG_CONFIG_HOME:-~/.config}/mudsh-ai/sprite.json` with file permissions `0600`. In the host shell, the sprite's commands run immediately with your account's permissions. The API provider receives the request and directory context, and may also receive shell output used for summaries or further actions.

### Use ChatGPT in the regular host shell

Install the OpenAI Codex CLI (`npm install -g @openai/codex`) and run:

```sh
mudsh chatgpt login       # reuse an existing ChatGPT sign-in or open the browser
mudsh chatgpt status      # check the login
mudsh chatgpt             # start the local MUD shell with the ChatGPT sprite
```

For a terminal without a browser, use `mudsh chatgpt login --device-auth`. Complete the sign-in on the device shown by Codex. An existing Codex API-key login still requires a ChatGPT sign-in.

In this shell, type a request to speak to ChatGPT or use `!command` to run Bash directly. ChatGPT uses the simple sprite flow. Each request sends the current directory survey and recent conversation through Codex. Actions run in your existing local Bash session. Use `/sprite off` and `/sprite on` to disconnect and reconnect during the session. The usual `mudsh` and `mudsh play` commands use the provider saved by `mudsh sprite setup`.

Codex manages the login and token refresh. On another trusted machine, use device login or, for Codex file-based storage, transfer `~/.codex/auth.json` over SSH into that user's Codex configuration directory and restrict it to the owner (`0600`). OS keyring credentials require signing in on the destination. [OpenAI authentication and headless login](https://learn.chatgpt.com/docs/auth)

## Play in the browser

Use `!` or `！` before a shell script. With the sprite offline, `look`, `go NAME`, `back`, `read FILE`, `hint`, `submit ANSWER`, `check`, `next`, and `progress` work directly. The shell command `!mudsh` also accepts the puzzle actions, including when the sprite is connected. Use the **Next room** button or `!cd "$(mudsh next)"` from a cleared room. The browser saves cleared rooms and the seed for the clues. Scratch files live in memory and are recreated on reload. The local dungeon saves its working files too.

The browser worker uses just-bash. The archive command can list or extract regular files and directories from tar or gzip-compressed tar files. Its ExifTool-style command reads GPS fields from JPEGs. The native dungeon runs GNU and Debian utilities, including the full ExifTool program.

## Dungeon walkthrough

The command column describes the intended technique. Submit the discovered flag unless the room asks for a filename, count, or name. The archive room checks the actual extracted file.

| Room | Goal | Shell tools |
| --- | --- | --- |
| 01 · The Watch Office | Locate a night order by filename and read its seal. | `find -name`, `cat` |
| 02 · The Scriptorium | Find a manuscript by the phrase it contains. | `grep -r`, `cat` |
| 03 · The Offering Vault | Count offerings, including hidden files. | `ls -A1`, `wc -l` |
| 04 · The Hundred Shelves | Look for a named ledger seal among 100 slots. | `find -name` |
| 05 · The Hidden Shelves | Find a dotfile among 100 slots. | `find -name`, `ls -a` |
| 06 · The Long Scroll | Extract one flag from a very long line. | `grep -o` |
| 07 · The Alarm Room | Identify the alarm that occurs once. | `sort` and `uniq -u` |
| 08 · The Painted Gallery | Identify the real contents of a misleading filename. | `file`, `cat` |
| 09 · The Sealed Archive | Unpack the dispatch and verify the extracted file. | `tar -tzf`, `tar -xzf` |
| 10 · The Seal Office | Match a dispatch to its MD5 receipt. | `md5sum` |
| 11 · The Golem Workshop | Retrieve a string from a WebAssembly binary. | `strings` |
| 12 · The Message Station | Decode a courier message. | `base64 -d` |
| 13 · The Scout Post | Read a JPEG's GPS data and identify the matching outpost. | `exiftool -n` |

## Connect the web sprite

Open **Sprite offline · Settings**, choose **OpenAI**, **Groq**, or **Custom OpenAI-compatible**, and enter an API key. OpenAI uses `https://api.openai.com/v1`, while Groq uses `https://api.groq.com/openai/v1`. Select **Get models**, then pick a model from the **Model** menu. Choose **Enter manually** to provide a model ID directly, including when the list cannot be loaded. Local servers can use a loopback HTTP URL and omit the key. The provider must allow browser requests from the demo’s origin (CORS). Requests use the [OpenAI Chat Completions format](https://platform.openai.com/docs/api-reference/chat/create), and model discovery uses the compatible `/models` response shape documented by [OpenAI](https://developers.openai.com/api/reference/resources/models/methods/list) and [Groq](https://console.groq.com/docs/api-reference).

**Enable sprite** stores the provider, endpoint, model ID and API key in this browser’s local storage. The key is stored in plain text and is accessible to scripts running on this origin. After a reload, the connection form is prefilled and the sprite starts offline until you enable it. **Disconnect** removes the saved API key and keeps the provider, endpoint and model.

Use the **Sprite mode** tab to name your sprite and choose how it works. Its name appears before every command it runs and every reply. **Simple** is the default. It selects one shell script, with an optional model request to summarize its output. You can change the history length, room context, request timeout, completion token cap, summary excerpts, temperature, reasoning effort and additional instructions. Leave optional sampling settings at the provider default when your model does not support them.

**Advanced (Pi Core)** uses a model that supports streaming tool calls. The sprite runs shell scripts directly, inspects their results, and keeps working toward a goal. Try “find the night orders and show me what they say”. You can set the action limit, goal timeout and tool-result size. If the sprite runs out of steps or a request fails, it reports the interruption and keeps actions that already completed.

Both modes use the same virtual filesystem. Use `!` or `！` to run a script directly. Rate limits and oversized requests stop the current turn while keeping the sprite enabled. Completed commands stay in effect. If a provider error takes the sprite offline, re-enable it in Settings to reconnect.

## Development

Run `npm ci`, `npm run build`, and `npm test`. Serve the demo with `python3 -m http.server --directory dist`. The tests exercise all 13 rooms against the browser interpreter. After building the Docker image, run `MUDSH_TEST_DOCKER=1 npm test` to exercise the same rooms with native Bash and verify the sandbox and save. To replay browser commands locally:

```sh
MUD_SEED=42 npm run probe -- 'look' 'hint' '!find records -name night-orders.txt'
```

The native and browser runners share the room definitions, generated data and grading in `src/campaign.ts`. The browser uses a Worker, and the native image contains a standalone Node.js runner. Pushing to `main` builds, tests and deploys the web demo.

Application code is [MIT licensed](LICENSE). See [third-party credits](THIRD_PARTY.md) for puzzle references and components included in the build.

## 歷史與參考資料

Dean “Gandalf” Swift 和 Xirium 在 2001 年發布了 MUD Shell（`mudsh`），用 MUD 的房間、方位和動詞來操作檔案系統。原版 1.2 是一支 Perl 腳本，檔頭署名 © 2001 Dean “Gandalf” Swift and Xirium。 [2001 年發布文](https://tech.slashdot.org/story/01/02/27/199238/mud-shell) · [原站封存的 1.2 版原始碼](https://web.archive.org/web/20080512003843id_/http://www.xirium.com/tech/mud-shell/download/mudsh)

Xirium 原站的版權政策將程式原始碼聲明為公有領域（public domain），原文為 “all program source code are public domain.” 該政策也指出網站的文字與圖片受版權保護。 [Xirium 原站版權政策](https://web.archive.org/web/20080509141949id_/http://www.xirium.com/admin/policy/copyright/index.html)

原站封存的 1.2 版腳本與 FreeBSD 封存套件中的 `bin/mudsh` 逐位元相同，其 SHA-1 也符合 NetBSD pkgsrc 的歷史紀錄。 [FreeBSD 封存套件](https://archive.freebsd.org/ftp/ports/sun4v/packages-6.2-release/shells/mudsh-20010311.tbz) · [NetBSD 校驗紀錄](https://raw.githubusercontent.com/NetBSD/pkgsrc/854466735b1bd22f3c5fea804a2c5c7efd1bb970/shells/mudsh/distinfo)
