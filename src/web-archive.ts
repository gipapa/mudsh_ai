import { defineCommand } from "just-bash/browser";
import { gunzipSync } from "./zlib.ts";

const archiveLimit = 8 * 1024 * 1024;
const decode = new TextDecoder();

function archiveEntries(data: Uint8Array) {
  const entries: { name: string; directory: boolean; bytes: Uint8Array }[] = [];
  const field = (offset: number, size: number) =>
    decode.decode(data.subarray(offset, offset + size)).split("\0")[0].trimEnd();
  for (let offset = 0; offset + 512 <= data.length; ) {
    const header = data.subarray(offset, offset + 512);
    if (header.every(value => value === 0)) return entries;

    const suffix = field(offset, 100);
    const prefix = field(offset + 345, 155);
    const name = (prefix ? prefix + "/" + suffix : suffix).replace(/^\.\//, "");
    const type = header[156];
    if (type !== 0 && type !== 48 && type !== 53) throw Error("Unsupported archive entry type.");
    if (!name || name.startsWith("/") || name.split("/").includes("..")) throw Error("Invalid archive member path.");
    const rawSize = field(offset + 124, 12);
    if (!/^[0-7]+$/.test(rawSize)) throw Error("Invalid archive member size.");
    const size = parseInt(rawSize, 8);
    const start = offset + 512;
    if (start + size > data.length) throw Error("Unexpected end of archive.");
    entries.push({name, directory:type === 53, bytes:data.subarray(start, start + size)});
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw Error("Unexpected end of archive.");
}

export const webTar = defineCommand("tar", async (args, {cwd, fs}) => {
  const [flags, archive, option, destination, ...extra] = args;
  const fail = (text: string) => ({stdout:"", stderr:"tar: " + text + "\n", exitCode:1});
  if (!archive || !/^-?(?:tz?|xz?)f$/.test(flags) ||
      option !== undefined && (option !== "-C" || destination === undefined || extra.length > 0)) {
    return fail("Web usage: tar -tzf ARCHIVE or tar -xzf ARCHIVE [-C DIRECTORY]");
  }
  try {
    const path = fs.resolvePath(cwd, archive);
    const stat = await fs.stat(path);
    if (!stat.isFile || stat.size > archiveLimit) return fail("Invalid or oversized archive.");
    let data = await fs.readFileBuffer(path);
    if (data[0] === 31 && data[1] === 139) data = gunzipSync(data);
    const entries = archiveEntries(data);
    if (flags.includes("t")) {
      return {stdout:entries.map(entry => entry.name + "\n").join(""), stderr:"", exitCode:0};
    }
    const target = destination ? fs.resolvePath(cwd, destination) : cwd;
    if (!(await fs.stat(target)).isDirectory) return fail("Destination must be a directory.");
    for (const entry of entries) {
      const output = fs.resolvePath(target, entry.name);
      if (entry.directory) await fs.mkdir(output, {recursive:true});
      else {
        await fs.mkdir(output.slice(0, output.lastIndexOf("/")) || "/", {recursive:true});
        await fs.writeFile(output, entry.bytes);
      }
    }
    return {stdout:"", stderr:"", exitCode:0};
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : String(cause));
  }
});
