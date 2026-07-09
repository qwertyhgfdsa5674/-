import { timingSafeEqual } from "node:crypto";
import { PddSignatureGenerator, type PddSignMethod } from "./signature.js";

export function verifyPddWebhookSignature(args: {
  params: Record<string, unknown>;
  clientSecret: string;
  signature: string;
  signMethod?: PddSignMethod;
}): boolean {
  const expected = PddSignatureGenerator.generate(
    args.params,
    args.clientSecret,
    args.signMethod ?? "md5"
  );
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(args.signature.toUpperCase());

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
