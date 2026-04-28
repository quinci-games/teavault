import sharp from 'sharp';

export interface CompressResult {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  extension: '.jpg';
}

/**
 * Compress a tea label image. Max 1600 px on longest side, JPEG q85,
 * EXIF-rotated, metadata stripped. No alpha handling needed — tea labels
 * are photos, not transparent cutouts.
 */
export async function compressTeaImage(input: Buffer): Promise<CompressResult> {
  const pipeline = sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85, mozjpeg: true });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    width: info.width,
    height: info.height,
    mimeType: 'image/jpeg',
    extension: '.jpg',
  };
}
