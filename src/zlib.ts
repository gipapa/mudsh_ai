export function gunzipSync(): never { throw Error("gzip decompression is unavailable in this demo"); }
export function gzipSync(): never { throw Error("gzip compression is unavailable in this demo"); }
export const constants = { Z_DEFAULT_COMPRESSION:-1, Z_BEST_COMPRESSION:9, Z_BEST_SPEED:1 };
