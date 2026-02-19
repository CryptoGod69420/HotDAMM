import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

if (typeof globalThis.process === "undefined") {
  (globalThis as any).process = { env: {}, browser: true, version: "" };
}

if (typeof globalThis.global === "undefined") {
  (globalThis as any).global = globalThis;
}
