import sharp from "sharp";
import { z } from "zod";

export const PlatformImageProfileSchema = z.object({
  platform: z.enum(["douyin", "pdd", "taobao"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.enum(["cover", "contain"]).default("contain"),
  background: z.string().default("#ffffff"),
  format: z.enum(["jpeg", "png", "webp"]).default("jpeg"),
  quality: z.number().int().min(1).max(100).default(82),
  maxBytes: z.number().int().positive().optional()
});
export type PlatformImageProfile = z.infer<typeof PlatformImageProfileSchema>;

export const DEFAULT_IMAGE_PROFILES: Record<
  PlatformImageProfile["platform"],
  PlatformImageProfile
> = {
  douyin: {
    platform: "douyin",
    width: 800,
    height: 800,
    fit: "cover",
    background: "#ffffff",
    format: "jpeg",
    quality: 84
  },
  pdd: {
    platform: "pdd",
    width: 750,
    height: 750,
    fit: "cover",
    background: "#ffffff",
    format: "jpeg",
    quality: 82
  },
  taobao: {
    platform: "taobao",
    width: 800,
    height: 800,
    fit: "contain",
    background: "#ffffff",
    format: "jpeg",
    quality: 86
  }
};

export interface ImagePipelineOptions {
  profile: PlatformImageProfile;
  watermarkText?: string;
  whiteBackground?: boolean;
}

export interface ProcessedImage {
  buffer: Buffer;
  format: PlatformImageProfile["format"];
  width: number;
  height: number;
  bytes: number;
}

export class ImagePipeline {
  public async process(
    input: Buffer | Uint8Array | string,
    options: ImagePipelineOptions
  ): Promise<ProcessedImage> {
    const profile = PlatformImageProfileSchema.parse(options.profile);
    let pipeline = sharp(input, { failOn: "none" }).resize(
      profile.width,
      profile.height,
      {
        fit: profile.fit,
        background: profile.background
      }
    );

    if (options.whiteBackground) {
      pipeline = pipeline.flatten({ background: profile.background });
    }

    if (options.watermarkText) {
      pipeline = pipeline.composite([
        {
          input: Buffer.from(watermarkSvg(options.watermarkText, profile)),
          gravity: "southeast"
        }
      ]);
    }

    pipeline = encode(pipeline, profile);
    const buffer = await pipeline.toBuffer();

    return {
      buffer,
      format: profile.format,
      width: profile.width,
      height: profile.height,
      bytes: buffer.byteLength
    };
  }
}

function encode(
  pipeline: sharp.Sharp,
  profile: PlatformImageProfile
): sharp.Sharp {
  if (profile.format === "png")
    return pipeline.png({ quality: profile.quality });
  if (profile.format === "webp")
    return pipeline.webp({ quality: profile.quality });
  return pipeline.jpeg({ quality: profile.quality, mozjpeg: true });
}

function watermarkSvg(text: string, profile: PlatformImageProfile): string {
  const safeText = text.replace(/[<>&"]/g, "");
  return `<svg width="${profile.width}" height="${profile.height}" xmlns="http://www.w3.org/2000/svg"><text x="${profile.width - 24}" y="${profile.height - 24}" text-anchor="end" font-size="28" fill="rgba(0,0,0,0.35)" font-family="Arial">${safeText}</text></svg>`;
}
