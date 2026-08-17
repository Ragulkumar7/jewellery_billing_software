import { createHash, randomBytes } from "node:crypto";

export function hash(value: string, algorithm = "sha256"): string {
  return createHash(algorithm).update(value).digest("hex");
}

export function generateId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}
