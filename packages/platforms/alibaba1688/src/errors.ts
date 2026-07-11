import { PlatformApiError } from "@ai-ecommerce/platform-common";

export class Alibaba1688Error extends PlatformApiError {
  public override get name(): string {
    return "Alibaba1688Error";
  }
}
