# mudsh_ai

[Play the web demo](https://gipapa.github.io/mudsh_ai/). Explore a filesystem as a text adventure. Directories are rooms, files are objects, and your expedition starts in a randomly seeded castle, dungeon or abandoned mine.

Type `look` or click an exit in the room survey. Follow the clue in `read field-note.txt` to find a letter. Use `go NAME`, `go DIRECTION`, `back`, `read FILE`, `help` and `quit` while the sprite is offline. Run shell scripts directly with `!` or `！`. Try `!mkdir tower`, `go tower`, then `!pwd`.

The demo runs in the browser using just-bash and an in-memory filesystem. Each script starts in the current room. File changes and movement last until reload or a new expedition. The shell supports a subset of Unix utilities, pipes and redirection.

## Connect the sprite

Open **Sprite offline · Settings**, choose **OpenAI**, **Groq**, or **Custom OpenAI-compatible**, and enter an API key. OpenAI uses `https://api.openai.com/v1`, while Groq uses `https://api.groq.com/openai/v1`. Select **Get models**, then pick a model from the **Model** menu. Choose **Enter manually** to provide a model ID directly, including when the list cannot be loaded. Local servers can use a loopback HTTP URL and omit the key. The provider must allow browser requests from the demo’s origin (CORS). Settings and credentials live in tab memory. Requests use the [OpenAI Chat Completions format](https://platform.openai.com/docs/api-reference/chat/create), and model discovery uses the compatible `/models` response shape documented by [OpenAI](https://developers.openai.com/api/reference/resources/models/methods/list) and [Groq](https://console.groq.com/docs/api-reference).

Try “take me to the archives” or “make a tower and enter it”. Ordinary text goes to the sprite, which can reply or execute one action immediately in the virtual world. Room details and a short turn history accompany the request. Requested file reads print verbatim. For a shell summary, the provider receives a bounded excerpt of the result. Use `!` or `！` to run a script directly. If the provider fails, play continues offline in the current room; a failed summary displays the completed result. Re-enable the sprite in Settings to reconnect.

## Development

Use Node.js 24 and npm. Run `npm ci`, `npm run build`, then `npm test`. Serve `dist/` with a static HTTP server, for example `python3 -m http.server --directory dist`. To replay commands locally against the same built interpreter:

```sh
MUD_SEED=0 npm run probe -- 'look' '!mkdir tower' 'go tower' '!pwd'
```

The shared TypeScript expedition logic lives in `src/world.ts`; English scenes and MUD messages live in `src/en.ts`. The browser runs the interpreter in a dedicated Worker. Pushing to `main` builds, tests and deploys the demo to GitHub Pages.

Application code is [MIT licensed](LICENSE). See [third-party credits](THIRD_PARTY.md) for the browser interpreter and the cwd integration adapted from agent-go-round.

## 歷史與參考資料

Dean “Gandalf” Swift 和 Xirium 在 2001 年發布了 MUD Shell（`mudsh`），用 MUD 的房間、方位和動詞來操作檔案系統。原版 1.2 是一支 Perl 腳本，檔頭署名 © 2001 Dean “Gandalf” Swift and Xirium。 [2001 年發布文](https://tech.slashdot.org/story/01/02/27/199238/mud-shell) · [原站封存的 1.2 版原始碼](https://web.archive.org/web/20080512003843id_/http://www.xirium.com/tech/mud-shell/download/mudsh)

Xirium 原站的版權政策將程式原始碼聲明為公有領域（public domain），原文為 “all program source code are public domain.” 該政策也指出網站的文字與圖片受版權保護。 [Xirium 原站版權政策](https://web.archive.org/web/20080509141949id_/http://www.xirium.com/admin/policy/copyright/index.html)

原站封存的 1.2 版腳本與 FreeBSD 封存套件中的 `bin/mudsh` 逐位元相同，其 SHA-1 也符合 NetBSD pkgsrc 的歷史紀錄。 [FreeBSD 封存套件](https://archive.freebsd.org/ftp/ports/sun4v/packages-6.2-release/shells/mudsh-20010311.tbz) · [NetBSD 校驗紀錄](https://raw.githubusercontent.com/NetBSD/pkgsrc/854466735b1bd22f3c5fea804a2c5c7efd1bb970/shells/mudsh/distinfo)
