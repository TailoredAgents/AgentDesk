import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import JSONBig from "json-bigint";

const safeJson = JSONBig({
  storeAsString: true,
  protoAction: "error",
  constructorAction: "error",
  strict: true,
});
export const parseProviderJson = (text: string): unknown =>
  safeJson.parse(text);
export function externalId(value: unknown): string {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new Error("Unsafe numeric provider ID");
  const id =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
    throw new Error("Invalid provider ID");
  return id;
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const randomSecret = () => randomBytes(32).toString("base64url");
export function stableHash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return digest(JSON.stringify(canonical(value)));
}
function key(value: string) {
  if (!/^[a-f\d]{64}$/i.test(value))
    throw new Error("CRM token encryption is not configured");
  return Buffer.from(value, "hex");
}
export function encryptTokens(
  value: unknown,
  context: string,
  secret = process.env.CRM_TOKEN_ENCRYPTION_KEY || "",
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    body.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}
export function decryptTokens<T>(
  value: string,
  context: string,
  secret = process.env.CRM_TOKEN_ENCRYPTION_KEY || "",
): T {
  const [version, iv, body, tag, extra] = value.split(".");
  if (version !== "v1" || !iv || !body || !tag || extra)
    throw new Error("Invalid encrypted token envelope");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
