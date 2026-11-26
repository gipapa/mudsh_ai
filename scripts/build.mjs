import { build } from "esbuild";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// node-pty 1.1.0 ships the macOS prebuilt spawn helper without its execute bit.
if (process.platform === "darwin") {
  const helper = new URL(`prebuilds/darwin-${process.arch}/spawn-helper`,import.meta.resolve("node-pty/package.json"));
  await chmod(fileURLToPath(helper),0o755).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
}

await mkdir("dist/licenses", { recursive: true });
// Adapted from AgentGoRound's MIT-licensed cwd patch. Preserve Unix command case.
const cwdResult = {
  name: "just-bash-cwd",
  setup(builder) {
    builder.onLoad({filter: /just-bash\/dist\/bundle\/browser\.js$/}, async ({path}) => {
      let contents = await readFile(path, "utf8");
      if (createHash("sha256").update(contents).digest("hex") !==
          "38f1ad1e3283980ecdf68cede8a4eed028c6dff6e8c31793dec1e0af529c446e") throw Error("Review just-bash cwd patch for this release");
      const edits = [
        ["let a=f=>l?this.logResult(f):f,c=ii(i,n?.signal)", "let agrState,a=f=>({...l?this.logResult(f):f,cwd:agrState?.cwd??n?.cwd??this.state.cwd}),c=ii(i,n?.signal)"],
        ["},g=t;u.rawScript", "},g=t;agrState=m;u.rawScript"],
        ['!t.trim())return{stdout:"",stderr:"",exitCode:0,env:Nn(this.state.env,u.env)};', '!t.trim())return a({stdout:"",stderr:"",exitCode:0,env:Nn(this.state.env,u.env)});'],
        // GNU grep -r searches dotfiles even when plain ls hides them.
        ['if(Bn(o),h.name.startsWith("."))continue;let m=', 'Bn(o);let m='],
        ['if(Bn(o),h.startsWith("."))continue;let m=', 'Bn(o);let m='],
      ];
      for (const [from,to] of edits) {
        if (contents.split(from).length !== 2) throw Error("Unexpected just-bash patch context");
        contents = contents.replace(from,to);
      }
      return {contents, resolveDir: resolve("node_modules/just-bash/dist/bundle"), loader:"js"};
    });
  }
};
await build({entryPoints: ["src/app.ts","src/worker.ts","src/session.ts"], outdir:"dist", bundle:true,
  format:"esm", splitting:true, platform:"browser", target:"es2022", minify:true, legalComments:"eof",
  chunkNames:"chunks/[name]-[hash]", alias:{"node:zlib":resolve("src/zlib.ts")}, plugins:[cwdResult]});
await build({entryPoints:["src/native.ts"], outfile:"dist-native/game.mjs", bundle:true, platform:"node",
  target:"node24", format:"esm", legalComments:"eof"});
await build({entryPoints:["src/native-console.ts"], outfile:"dist-native/console.mjs", bundle:true, platform:"node",
  packages:"external", target:"node24", format:"esm", legalComments:"eof"});
for (const file of ["Dockerfile","shell.bash","play.bash","bridge.bash","terminal.bash"]) await copyFile("native/" + file, "dist-native/" + file);
await writeFile("dist-native/node-path",process.execPath + "\n");
for (const file of ["index.html","style.css","LICENSE"]) await copyFile(file, "dist/" + file);
await copyFile("node_modules/just-bash/LICENSE","dist/licenses/just-bash.txt");
await copyFile("licenses/pi.txt","dist/licenses/pi.txt");
await copyFile("node_modules/fflate/LICENSE","dist/licenses/fflate.txt");
await copyFile("node_modules/fflate/LICENSE","dist-native/fflate-LICENSE");
for (const [name, file] of [
  ["openai","LICENSE"], ["typebox","license"], ["ignore","LICENSE-MIT"],
  ["partial-json","LICENSE"], ["yaml","LICENSE"],
]) {
  await copyFile(`node_modules/${name}/${file}`,`dist/licenses/${name}.txt`);
}
await copyFile("THIRD_PARTY.md","dist/licenses/credits.txt");
await writeFile("dist/.nojekyll","");
