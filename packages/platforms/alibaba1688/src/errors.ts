export class Alibaba1688Error extends Error {
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
    this.name = "Alibaba1688Error";
    this.errorCode = args.errorCode;
    this.errorMessage = args.errorMessage;
    this.status = args.status;
  }
}
