import { PlatformApiError } from "@ai-ecommerce/platform-common";

export class PddError extends PlatformApiError {
  public override get name(): string {
    return "PddError";
  }
}
