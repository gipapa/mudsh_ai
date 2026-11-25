import { gzipSync } from "fflate";

const encode = (text: string) => new TextEncoder().encode(text);

export function sealedArchive(name: string, contents: string) {
  const data = encode(contents);
  const header = new Uint8Array(512);
  const field = (at: number, value: string) => header.set(encode(value), at);
  field(0, name);
  field(100, "0000644\0");
  field(108, "0000000\0");
  field(116, "0000000\0");
  field(124, data.length.toString(8).padStart(11, "0") + "\0");
  field(136, "00000000000\0");
  field(148, "        ");
  field(156, "0");
  field(257, "ustar\0" + "00");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  field(148, checksum.toString(8).padStart(6, "0") + "\0 ");

  const tar = new Uint8Array(512 + Math.ceil(data.length / 512) * 512 + 1024);
  tar.set(header);
  tar.set(data, 512);
  return gzipSync(tar, {mtime: 0});
}

export function golemModule(flag: string) {
  // A valid WebAssembly module exporting greet(), with the inscription in a custom section.
  const module = [
    0, 97, 115, 109, 1, 0, 0, 0,
    1, 5, 1, 96, 0, 1, 127,
    3, 2, 1, 0,
    7, 9, 1, 5, 103, 114, 101, 101, 116, 0, 0,
    10, 6, 1, 4, 0, 65, 42, 11,
  ];
  const section = encode("inscription\0The workshop is quiet.\0" + flag + "\0");
  return Uint8Array.of(...module, 0, section.length + 1, 11, ...section);
}

// An original 96×60 JPEG of the stone gate, used as a metadata fixture.
const gatePhoto = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA4KCw0LCQ4NDA0QDw4RFiQXFhQUFiwgIRokNC43NjMuMjI6QVNGOj1OPjIySGJJTlZYXV5dOEVmbWVabFNbXVn/2wBDAQ8QEBYTFioXFypZOzI7WVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVn/wAARCAA8AGADASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAAIDBAUBBgf/xAAvEAACAgEDAQUFCQAAAAAAAAAAAQIRAwQSITEFIkFhcRMzUVKBFDJCkaGiwdHw/8QAFwEBAQEBAAAAAAAAAAAAAAAAAAIBA//EABkRAQEBAQEBAAAAAAAAAAAAAAABETECA//aAAwDAQACEQMRAD8A8VQUNQUUktBQ1BQC0FDUFWAtBRMsarnkWUK5XQaI6ChqJtHhjn1mDDNtRyZIxbXWm6GivQUfQMnY+gyad4fs2OCcaUoxSkvO+tngaI8fSe+NvnDNUFEjVnKK1hKCiToA0R0PGNc+J0AAAAwK4fANnmMAFvL2rr8mneCeplLG47WqVtevUoUSHGhMnB0AAC1jinBdyPRdTqglxsg2l1O449yPefKXwOxTaUtztryIdEc9uKDlKEKSbKD10tz24saT8GrJe0m9mNN3bf6GeVImrkNdUrnig15KjQ2qtyhBxq+PEwzU7Pbnp9rdJNrj6f2ZSLLh07kP99CLMl7NNRirfgTNNNd58vyI88axrltWZG3isAAWgAAAWsajtVx+H4fIZbNze3ivlGx+7j6IIfcj6EOih2kk445RVJNpuqM82tRCM9Lk3K6UmvJ8mKVE0GloIpaWVx5k21wZpvRhGDjGKqKTpfkKQdz5f2kOVJYo8U/Hgnl1j6/wR6n3a9SY28VQAC0P/9k=";

export function scoutPhoto(latitude: number, longitude: number) {
  const jpeg = Uint8Array.from(atob(gatePhoto), char => char.charCodeAt(0));
  const exif = new Uint8Array(6 + 140);
  exif.set(encode("Exif\0\0"));
  const tiff = new DataView(exif.buffer, 6);
  tiff.setUint16(0, 0x4949);
  const u16 = (at: number, n: number) => tiff.setUint16(at, n, true);
  const u32 = (at: number, n: number) => tiff.setUint32(at, n, true);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    u16(at, tag); u16(at + 2, type); u32(at + 4, count); u32(at + 8, value);
  };
  u16(2, 42); u32(4, 8);
  u16(8, 1); entry(10, 0x8825, 4, 1, 26);
  u16(26, 5);
  entry(28, 0, 1, 4, 0x0302);
  entry(40, 1, 2, 2, latitude < 0 ? 83 : 78);
  entry(52, 2, 5, 3, 92);
  entry(64, 3, 2, 2, longitude < 0 ? 87 : 69);
  entry(76, 4, 5, 3, 116);
  for (const [offset, value] of [[92, latitude], [116, longitude]]) {
    const minutes = Math.round(Math.abs(value) * 60);
    u32(offset, Math.floor(minutes / 60)); u32(offset + 4, 1);
    u32(offset + 8, minutes % 60); u32(offset + 12, 1);
    u32(offset + 16, 0); u32(offset + 20, 1);
  }
  const length = exif.length + 2;
  const photo = new Uint8Array(jpeg.length + exif.length + 4);
  photo.set([255, 216, 255, 225, length >> 8, length & 255]);
  photo.set(exif, 6);
  photo.set(jpeg.subarray(2), 6 + exif.length);
  return photo;
}

export function gpsCoordinates(bytes: Uint8Array): [number, number] | undefined {
  if (bytes[0] !== 255 || bytes[1] !== 216) return;
  try {
    const jpeg = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 2; offset + 4 <= bytes.length && bytes[offset] === 255;) {
      const marker = bytes[offset + 1];
      if (marker === 218 || marker === 217) return;
      const size = jpeg.getUint16(offset + 2);
      if (size < 2 || offset + size + 2 > bytes.length) return;
      if (marker === 225 && new TextDecoder().decode(bytes.subarray(offset + 4, offset + 10)) === "Exif\0\0") {
        const tiff = new DataView(bytes.buffer, bytes.byteOffset + offset + 10, size - 8);
        const little = tiff.getUint16(0) === 0x4949;
        if ((!little && tiff.getUint16(0) !== 0x4d4d) || tiff.getUint16(2, little) !== 42) return;
        const u16 = (at: number) => tiff.getUint16(at, little);
        const u32 = (at: number) => tiff.getUint32(at, little);
        const findTag = (ifd: number, tag: number) => {
          for (let i = 0, count = u16(ifd); i < count; i++) {
            const at = ifd + 2 + 12 * i;
            if (u16(at) === tag) return at + 8;
          }
          throw Error("Missing EXIF tag");
        };
        const gps = u32(findTag(u32(4), 0x8825));
        const coordinate = (tag: number, negative: number) => {
          const at = u32(findTag(gps, tag));
          const sign = tiff.getUint8(findTag(gps, tag - 1)) === negative ? -1 : 1;
          const rational = (offset: number) => u32(offset) / u32(offset + 4);
          return sign * (rational(at) + rational(at + 8) / 60 + rational(at + 16) / 3600);
        };
        const lat = coordinate(2, 83), lon = coordinate(4, 87);
        if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
        return;
      }
      offset += size + 2;
    }
  } catch (error) {
    if (!(error instanceof RangeError) && !(error instanceof Error && error.message === "Missing EXIF tag")) throw error;
  }
}
