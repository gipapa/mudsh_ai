import { gunzipSync as decompress, gzipSync as compress, type GzipOptions } from "fflate";

export function gunzipSync(data: Uint8Array, options?: {maxOutputLength?: number}) {
  if (data.length < 18 || data[0] !== 31 || data[1] !== 139) throw Error("Invalid gzip stream");
  const footer = new DataView(data.buffer, data.byteOffset + data.length - 4, 4);
  const expected = footer.getUint32(0, true);
  const limit = Math.min(options?.maxOutputLength ?? 8388608, 8388608);
  if (expected > limit) throw Error("gzip output exceeds the demo's limit");
  return decompress(data, {out: new Uint8Array(expected)});
}

export function gzipSync(data: Uint8Array, options?: {level?: GzipOptions["level"]}) {
  const level = options?.level;
  return compress(data, {level: level !== undefined && level >= 0 ? level : undefined, mtime: 0});
}
export const constants = { Z_DEFAULT_COMPRESSION:-1, Z_BEST_COMPRESSION:9, Z_BEST_SPEED:1 };
