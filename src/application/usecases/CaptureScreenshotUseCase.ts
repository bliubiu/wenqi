export interface CaptureScreenshotRequest {
  includeWatermark?: boolean;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface CaptureScreenshotResponse {
  dataUrl: string;
  blobSize: number;
  format: string;
}

export class CaptureScreenshotUseCase {
  async execute(
    canvas: HTMLCanvasElement | null,
    request?: CaptureScreenshotRequest
  ): Promise<CaptureScreenshotResponse> {
    if (!canvas) {
      throw new Error('渲染异常：无法获取画布');
    }

    const format = request?.format ?? 'png';
    const quality = request?.quality ?? 0.92;
    const includeWatermark = request?.includeWatermark ?? true;

    if (includeWatermark) {
      this.addWatermark(canvas);
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('渲染异常：截图生成失败'));
            return;
          }

          const dataUrl = canvas.toDataURL(`image/${format}`, quality);
          resolve({
            dataUrl,
            blobSize: blob.size,
            format,
          });
        },
        `image/${format}`,
        quality
      );
    });
  }

  private addWatermark(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const text = '文气 · 观文气之聚散，见千年之脉络';
    ctx.font = '14px "Noto Sans SC", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.textAlign = 'right';
    ctx.fillText(text, canvas.width - 16, canvas.height - 16);
  }
}
