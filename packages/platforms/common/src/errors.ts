export class PlatformApiError extends Error {
  public readonly errorCode: string;
  public readonly errorMessage: string;
  public readonly status?: number;

  public constructor(args: {
    errorCode: string;
    errorMessage: string;
    status?: number;
    cause?: unknown;
  }) {
    super(args.errorMessage, { cause: args.cause });
    this.errorCode = args.errorCode;
    this.errorMessage = args.errorMessage;
    this.status = args.status;
  }

  public override get name(): string {
    return `${this.constructor.name}(${this.errorCode})`;
  }
}
