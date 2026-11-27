# mudsh_ai

mudsh gives a filesystem the vocabulary of a text adventure. A directory is a room, a file is something you can read, and `!` runs a shell command. Use it in your own working directory or play **The Lantern Below**, a dungeon of 13 shell puzzles. The optional AI assistant is called the *sprite*.

| Where to start | What you get |
| --- | --- |
| [Play in the browser](https://gipapa.github.io/mudsh_ai/) | The dungeon in a virtual filesystem. No installation or sign-in required. |
| `mudsh` | A persistent Bash session in your current directory on macOS or Linux. |
| `mudsh chatgpt` | The same host shell with a sprite that uses your [ChatGPT login](#chatgpt-in-the-host-shell). |
| `mudsh play` | The dungeon in an isolated Docker container with a persistent save. |

## Try the first room

Open the web demo or start the local dungeon. With the sprite offline, enter these lines at the MUD prompt:

```text
look
read objective.txt
!find records -name night-orders.txt
```

Read the file at the path returned by `find`. Enter `submit ANSWER` with the flag you found, then `next` to move on. Each room has its own `objective.txt`. Use `hint` for a clue, `progress` to see cleared rooms, or `check` when the objective asks you to create a file.

## Install the local shell

Use Bash on macOS or Linux and Node.js 24 with npm. If npm needs to compile `node-pty`, install the Xcode command-line tools on macOS, or a C++ compiler, Make and Python 3 on Linux. For a private npm registry, configure [`~/.mudshrc`](#local-downloads-and-endpoints) before installing dependencies.

Build and start mudsh from the repository root.

```sh
./bin/mudsh install-deps
npm run build
npm link
mudsh
```

`npm link` puts `mudsh` on your PATH. You can skip that step and use `./bin/mudsh` from the repository instead. Docker is required only for the local dungeon.

## ChatGPT in the host shell

Install the OpenAI Codex CLI, then check whether it recognizes a ChatGPT login:

```sh
npm install -g @openai/codex
mudsh chatgpt status
```

If the status says you are signed in, run `mudsh chatgpt`. Otherwise run `mudsh chatgpt login`, finish the browser sign-in, then run `mudsh chatgpt`. On a host without a browser, use `mudsh chatgpt login --device-auth` and follow the instructions on a device with a browser. This mode requires a ChatGPT sign-in even if Codex already has an API key.

Type a request to speak to ChatGPT, or use `!command` to work directly in Bash. ChatGPT uses the simple sprite mode. Codex receives the directory listing and recent conversation, and mudsh runs requested actions with your account’s permissions. Use `/sprite off` to return to MUD verbs and `/sprite on` to reconnect.

### Reuse a login on another machine

**`~/.codex/auth.json` is the default location for Codex’s file-based login cache.** If `CODEX_HOME` is set, the path is `$CODEX_HOME/auth.json`. Codex manages the credentials and token refresh. On the same machine, mudsh reuses that login through the CLI. Keep the cache out of Git, chat messages and `~/.mudshrc`. [OpenAI authentication and headless login](https://learn.chatgpt.com/docs/auth)

For a fresh, trusted SSH host, you can transfer a file-based cache from the signed-in machine. Replace `user@host` with your destination. This example uses the default destination directory, creates the file with owner-only permissions (`0600`), and stops if a regular cache file already exists:

```sh
ssh user@host 'umask 077 && mkdir -p ~/.codex && set -C && cat > ~/.codex/auth.json' \
  < "${CODEX_HOME:-$HOME/.codex}/auth.json"
```

If the destination uses a custom `CODEX_HOME`, change the remote directory in the example to match. On the destination, run `mudsh chatgpt status` to verify the login. If Codex stored the source credentials in the OS keyring, use device sign-in on the destination. [Codex credential storage](https://learn.chatgpt.com/docs/auth#login-caching)

## Working at the MUD prompt

| Input | Action |
| --- | --- |
| `look`, `go EXIT`, `back` or `go back`, `read FILE` | Inspect files and navigate by directory name or compass direction with the sprite offline. |
| `!command` or `！command` | Run a shell command directly, including when the sprite is online. |
| A plain-language request | Ask the connected sprite to reply or act. |
| `help`, `quit` | Show MUD verbs or leave the session with the sprite offline. |

In the local terminal, `!` opens Bash’s own line editor. Tab completes Bash commands and paths. In offline MUD mode, Tab completes verbs and paths for `go` and `read`. Pipes, redirects, shell variables and directory changes work across turns. Use Ctrl-Z to suspend a foreground job, then `!jobs`, `!bg` or `!fg` to manage it. Use `!exit` or Ctrl-D to leave.

The prompt is green, the sprite name is cyan, Help command names are yellow, file and directory references are blue, and errors are red. Set `NO_COLOR=1` for a plain terminal. Piped mudsh output is plain text.

## Playing and saving the dungeon

**Browser.** The browser saves cleared rooms and the seed used to generate clues. Scratch files live in memory and are recreated on reload. To enter an unlocked room, use the **Next room** button, the offline verb `next`, or `!cd "$(mudsh next)"`. The browser runs just-bash in a Worker and includes tar extraction and a JPEG GPS reader for the puzzles.

**Docker.** Start Docker Engine or Docker Desktop, then build the image and open the dungeon:

```sh
mudsh build-image
mudsh play
```

Rebuild the project and image after game updates. The container runs Bash and Debian utilities, including ExifTool, as an unprivileged user. It has a read-only base image, a temporary filesystem, dropped capabilities, CPU, memory and process limits, and no external network. A named volume holds both working files and progress. The host process makes any sprite API requests. Host directories and the Docker socket stay outside the container.

Use `MUDSH_PROFILE=practice mudsh play` for a separate save. The local `resume` verb returns to the current unlocked room. Puzzle verbs also work through Bash, for example `!mudsh hint` or `!mudsh submit "$answer"`. For an ordinary interactive Bash prompt, use `mudsh play --bash` in the dungeon or `mudsh --bash` on the host.

## Connect an API provider

The browser, `mudsh` and `mudsh play` support OpenAI, Groq and custom OpenAI-compatible endpoints. Both native modes share the same API provider settings. The separate `mudsh chatgpt` command uses the Codex login described above.

### Local setup

```sh
mudsh sprite setup
mudsh sprite models
mudsh sprite set name Ember
mudsh sprite set mode advanced
mudsh sprite help
```

Setup lets you fetch a model list or enter a model ID. The native settings file is `${XDG_CONFIG_HOME:-~/.config}/mudsh-ai/sprite.json`. It stores the API key in plain text with permissions `0600`. Use `/sprite on` to reload the settings in an open session. The provider receives your request and directory context, and may receive command output for a summary or follow-up action.

### Browser setup

1. Open **Sprite offline · Settings** and choose a provider. The presets use `https://api.openai.com/v1` and `https://api.groq.com/openai/v1`.
2. Enter the API key if required. Select **Get models** and choose a model, or select **Enter manually** and type its ID.
3. Select **Enable sprite**. The browser saves the connection, including the key, in plain text in local storage. Scripts on the same origin can access it. After a reload, enable the sprite again. **Disconnect** clears the saved key and retains the endpoint and model.

A local server can use loopback HTTP and omit the key. It must allow requests from the demo’s origin through CORS. Custom providers need Chat Completions and a compatible `/models` response for model discovery. [Chat Completions](https://platform.openai.com/docs/api-reference/chat/create) · [OpenAI model list](https://developers.openai.com/api/reference/resources/models/methods/list) · [Groq API reference](https://console.groq.com/docs/api-reference)

### Sprite modes

**Simple** is the default. The sprite can reply or run one shell script, then optionally summarize the output. **Advanced (Pi Core)** uses streaming tool calls to run commands, inspect results and choose the next action. For example, ask it to “find the night orders and show me what they say.”

The browser’s **Sprite mode** tab and the local `mudsh sprite set` command let you adjust history, directory context, timeouts, response limits, summaries and instructions. Advanced mode also has an action limit, goal timeout and tool-result size limit. Use provider defaults for sampling options your model does not support. A rate limit or oversized request interrupts the current turn. Completed commands remain in effect. If a provider error takes the sprite offline, reconnect from Settings in the browser or with `/sprite on` locally.

## Local downloads and endpoints

Copy the repository’s [`.mudshrc`](.mudshrc) to `~/.mudshrc` if you need custom settings. Keep `return 0` on the first line so an accidental `source ~/.mudshrc` returns immediately. The launcher parses literal `key=value` lines. Omit shell quoting and variable expansion. Lines starting with `#` are comments.

| Setting | Default | Effect |
| --- | --- | --- |
| `harbor_project` | Empty | Sets the Docker base image source. For example, `harbor.example.org/dockerhub/library` selects `harbor.example.org/dockerhub/library/node:24-bookworm-slim`. Empty uses the Docker Hub Node image. |
| `npm_registry` | Empty | Sets the registry for `mudsh install-deps`, for example `https://packages.example.org/npm/`. Empty uses npm’s registry configuration. |
| `allow_remote_http` | `false` | The native API sprite accepts HTTPS and loopback HTTP. Set to `true` to allow HTTP on other hosts for model discovery and chat. Restart mudsh to apply it. |

Use Docker or npm login for private registries. HTTP sends the API key and conversation in cleartext. The browser accepts HTTPS and loopback HTTP.

## Use mudsh as your login shell

Build the project in a directory you intend to keep. Save your current shell path, then try the login launcher:

```sh
printf '%s\n' "$SHELL"
mudsh_login="$(pwd -P)/bin/login/mudsh"
"$mudsh_login"
```

Exit the trial session. To register and select the launcher from the original shell:

```sh
grep -Fxq -- "$mudsh_login" /etc/shells || printf '%s\n' "$mudsh_login" | sudo tee -a /etc/shells
chsh -s "$mudsh_login"
```

Open a new login terminal and run `!shopt -q login_shell && echo "login shell"`. Bash reads `/etc/profile` and the first readable file among `~/.bash_profile`, `~/.bash_login` and `~/.profile`. To switch back, run `!chsh -s /bin/zsh` or substitute your previous shell’s absolute path.

## Room guide

Use this table for a hint about the shell tools in each room. Most rooms accept a flag. Others ask for a count, filename or outpost name. The archive room verifies the extracted file with `check`.

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

## Development

From a built checkout, run the tests and replay first-room commands against the browser interpreter:

```sh
npm test
MUD_SEED=42 npm run probe -- 'look' 'hint' '!find records -name night-orders.txt'
```

Serve the built demo with `python3 -m http.server --directory dist`. To test the native sandbox, saved progress and all 13 rooms against Bash, build the Docker image and run `MUDSH_TEST_DOCKER=1 npm test`.

The browser and native runners share room definitions, generated data and grading in [src/campaign.ts](src/campaign.ts). The image includes a standalone Node.js game runner. Pushes to `main` build, test and deploy the demo to GitHub Pages.

## License

The application uses the MIT license. Puzzle references, dependencies and their licenses are listed in the third-party credits. [License](LICENSE) · [Third-party credits](THIRD_PARTY.md)

## 歷史與參考資料

Dean “Gandalf” Swift 和 Xirium 在 2001 年發布了 MUD Shell（`mudsh`），用 MUD 的房間、方位和動詞來操作檔案系統。原版 1.2 是一支 Perl 腳本，檔頭署名 © 2001 Dean “Gandalf” Swift and Xirium。 [2001 年發布文](https://tech.slashdot.org/story/01/02/27/199238/mud-shell) · [原站封存的 1.2 版原始碼](https://web.archive.org/web/20080512003843id_/http://www.xirium.com/tech/mud-shell/download/mudsh)

Xirium 原站的版權政策將程式原始碼聲明為公有領域（public domain），原文為 “all program source code are public domain.” 該政策也指出網站的文字與圖片受版權保護。 [Xirium 原站版權政策](https://web.archive.org/web/20080509141949id_/http://www.xirium.com/admin/policy/copyright/index.html)

原站封存的 1.2 版腳本與 FreeBSD 封存套件中的 `bin/mudsh` 逐位元相同，其 SHA-1 也符合 NetBSD pkgsrc 的歷史紀錄。 [FreeBSD 封存套件](https://archive.freebsd.org/ftp/ports/sun4v/packages-6.2-release/shells/mudsh-20010311.tbz) · [NetBSD 校驗紀錄](https://raw.githubusercontent.com/NetBSD/pkgsrc/854466735b1bd22f3c5fea804a2c5c7efd1bb970/shells/mudsh/distinfo)
