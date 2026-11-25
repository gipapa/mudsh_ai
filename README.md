# mudsh_ai

[Play the web demo](https://gipapa.github.io/mudsh_ai/). Explore a filesystem as a text adventure. Directories are rooms, files are objects, and each expedition starts on a randomly selected map.

Type `read field-note.txt` to find out why you’re there. While the sprite is offline, use `look` to survey the room, click an exit or type `go NAME` or `go DIRECTION` to move, use `back` to return, and use `read FILE` to read an object. Type `help` for the available verbs or `quit` to end the expedition. Run shell scripts directly with `!` or `！`. Try `!mkdir tower`, `go tower`, then `!pwd`.

The demo runs in the browser using just-bash and an in-memory filesystem. Each script starts in the current room. File changes and movement last until reload or a new expedition. The shell supports a subset of Unix utilities, pipes and redirection.

## Maps and walkthrough

| Map | Setting | Objective | Example seed |
| --- | --- | --- | --- |
| Ashwick Keep | Castle | Find Elin’s letter beyond the gatehouse. | `0` |
| Hollowdeep | Dungeon | Find the Ferryman’s letter below the iron threshold. | `1` |
| Embervein Mine | Abandoned mine | Find Foreman Vale’s letter near the drift entrance. | `2` |
| Tideglass Observatory | Coastal observatory | Find the password and open the chest in the vault. | `3` |

The walkthrough uses room names because compass directions depend on the seed. All four maps can be played with the sprite offline.

<details>
<summary>Show solutions (spoilers)</summary>

- **Ashwick Keep.** From the gatehouse, use `go archives` and `read letter.txt`.
- **Hollowdeep.** From the threshold, use `go cells` and `read letter.txt`.
- **Embervein Mine.** From the drift entrance, use `go workshop` and `read letter.txt`.
- **Tideglass Observatory.**
  1. From the landing, use `go chartroom` and `read star-chart.txt` to find the first two digits.
  2. Use `back`, then `go tide-room` and `read tide-ledger.txt` to find the last two digits.
  3. Join the two pairs in that order, keeping any leading zero. The password depends on the map seed.
  4. Use `back` and `go vault`. Type `unlock CODE` with the sprite offline or `!unlock CODE` in the shell, substituting the four digits for `CODE`. Then `read chest.txt` to see what’s inside.

</details>

## Connect the sprite

Open **Sprite offline · Settings**, choose **OpenAI**, **Groq**, or **Custom OpenAI-compatible**, and enter an API key. OpenAI uses `https://api.openai.com/v1`, while Groq uses `https://api.groq.com/openai/v1`. Select **Get models**, then pick a model from the **Model** menu. Choose **Enter manually** to provide a model ID directly, including when the list cannot be loaded. Local servers can use a loopback HTTP URL and omit the key. The provider must allow browser requests from the demo’s origin (CORS). Requests use the [OpenAI Chat Completions format](https://platform.openai.com/docs/api-reference/chat/create), and model discovery uses the compatible `/models` response shape documented by [OpenAI](https://developers.openai.com/api/reference/resources/models/methods/list) and [Groq](https://console.groq.com/docs/api-reference).

**Enable sprite** stores the provider, endpoint, model ID and API key in this browser’s local storage. The key is stored in plain text and is accessible to scripts running on this origin. After a reload, the connection form is prefilled and the sprite starts offline until you enable it. **Disconnect** removes the saved API key and keeps the provider, endpoint and model.

Use the **Sprite mode** tab to name your sprite and choose how it works. Its name appears before every command it runs and every reply. **Simple** is the default. It selects one shell script, with an optional model request to summarize its output. You can change the history length, room context, request timeout, completion token cap, summary excerpts, temperature, reasoning effort and additional instructions. Leave optional sampling settings at the provider default when your model does not support them.

**Advanced (Pi Core)** uses a model that supports streaming tool calls. The sprite runs shell scripts directly, inspects their results, and keeps working toward a goal. Try “find the letter about the bell and take me to its room”. You can set the action limit, goal timeout and tool-result size. If the sprite runs out of steps or a request fails, it reports the interruption and keeps actions that already completed.

Both modes use the same virtual filesystem. Use `!` or `！` to run a script directly. Rate limits and oversized requests stop the current turn while keeping the sprite enabled. Completed commands stay in effect. If a provider error takes the sprite offline, re-enable it in Settings to reconnect.

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
