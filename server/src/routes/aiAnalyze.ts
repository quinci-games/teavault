import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer';
import { requireAuth } from '../auth/middleware.js';
import { withGeminiFallback, getPrimaryGeminiKey } from '../lib/geminiKeys.js';

const router = Router();
router.use(requireAuth);

// Configurable via GEMINI_VISION_MODEL in server/.env. Default is
// `gemini-3.1-flash-lite-preview` — Google's current best quality-per-
// dollar vision model ($0.25/$1.50 per 1M tokens), billed as "frontier-
// class rivaling larger models at a fraction of the cost." Good enough
// for tricky local-brand recognition without paying flash-tier prices.
// Alternatives, cheapest → most expensive:
//   gemini-2.5-flash-lite        $0.10 / $0.40  (cheapest stable)
//   gemini-3.1-flash-lite-preview $0.25 / $1.50  (default — best bang/buck)
//   gemini-2.5-flash             $0.30 / $2.50  (stable flash tier)
//   gemini-3-flash-preview       $0.50 / $3.00  (top tier, overkill here)
const VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-3.1-flash-lite-preview';

// ─── Known local / small brands ──────────────────────────────────────
// Small / local brands Gemini's world knowledge doesn't reliably cover.
// Each entry is a visual fingerprint the model can match against even
// when the logo is partially obscured. Appended to every vision prompt.
const BRAND_HINTS = `KNOWN BRANDS — use these fingerprints to identify brands Gemini may not recognize by default:

**Old Barrel Tea Co** (Albuquerque, NM — loose-leaf tea + pyramid sachets). Identify as this brand when you see ALL of:
- Kraft stand-up pouch (brown kraft back, clear front window showing pyramid sachets inside)
- Solid-colored vertical rectangular label with soft rounded/ornate corners + small corner flourishes
- "OLD BARREL TEA CO" set in a curved arch across the top of the label, thin hand-drawn serif, all caps, white text
- Small central illustration of a white/pastel teacup on a saucer with a leafy sprig + small 5-petaled flowers rising from the cup (this teacup-with-flowers motif is the strongest single fingerprint)
- Product name in a white ribbon/banner scroll centered below the teacup, all caps serif
- Three single-word tasting descriptors separated by bullet dots beneath the banner (e.g. "CITRUS • LAVENDER • CREAMY")
- Label background is color-coded by blend: periwinkle blue, burnt orange/rust, magenta, sage green, etc.
- Bottom often reads "15 PYRAMID SACHETS" / "NET WT 1.32OZ (37G)"
- Product names often reference New Mexican food/culture (Apple Empanada, Green Chile Biscochito, Prickly Pear, Pecan Pie Pu-erh, Enchanted Lavender, etc.)
- Form is almost always "sachet" (pyramid bags) unless the label explicitly says loose-leaf
- When identified, set brand to exactly "Old Barrel Tea Co"`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

function parseLlmJson<T = unknown>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

const TEA_ANALYSIS_PROMPT = `You are analyzing a photo of a tea package or label for an inventory app. Return a JSON object with the following fields. Be specific and concise.

{
  "name": "short descriptive name (e.g. 'Earl Grey', 'Jasmine Green Tea'). Use the product name on the label when visible.",
  "brand": "brand name if clearly visible on the package, else empty string",
  "type": "ONE of: black, green, white, oolong, herbal, rooibos, pu-erh, matcha, chai, other",
  "form": "ONE of: bagged, loose, sachet",
  "caffeine": "ONE of: none, low, medium, high",
  "flavorTags": ["array of 1-5 short flavor/ingredient tags (e.g. 'bergamot', 'floral', 'citrus', 'mint')"],
  "notes": "brief observations about the tea under 100 chars — origin, steep instructions, etc."
}

Rules:
- Return ONLY the JSON object. No markdown, no explanation.
- If you can't read the label clearly, set "name" to "Unknown tea" and leave other fields empty/default.
- Every enum field MUST be one of the listed values (or empty string if truly unknown).
- Herbal/rooibos are typically "none" for caffeine; black/pu-erh "medium" to "high"; green/white/oolong "low" to "medium"; matcha "high".
- Keep flavorTags short and lowercase.

${BRAND_HINTS}`;

// ─── POST /api/ai/analyze-teas-batch ─────────────────────────────────
// User snaps one photo of a layout (boxes on a table, labels up). We ask
// Gemini to detect each tea and return a bbox for it. Then we crop each
// bbox with sharp and return the thumbnails so the client can show a
// review grid. No DB writes — the client saves the accepted subset.

const BATCH_PROMPT = `You are analyzing a photo showing MULTIPLE tea packages (boxes, tins, pouches, or tea bags) laid out together. Identify each DISTINCT tea product visible and return a JSON array.

For each detected tea, return:
{
  "name": "short descriptive name from the label (e.g. 'Earl Grey', 'Jasmine Green Tea')",
  "brand": "brand name if clearly visible, else empty string",
  "type": "ONE of: black, green, white, oolong, herbal, rooibos, pu-erh, matcha, chai, other",
  "form": "ONE of: bagged, loose, sachet",
  "caffeine": "ONE of: none, low, medium, high",
  "flavorTags": ["1-5 short lowercase flavor/ingredient tags"],
  "notes": "brief observation under 100 chars",
  "bbox": { "yMin": 0, "xMin": 0, "yMax": 1000, "xMax": 1000 }
}

BOUNDING BOX RULES:
- Coordinates are normalized 0-1000 where (0,0) is top-left and (1000,1000) is bottom-right.
- Each bbox should tightly enclose JUST that tea package with ~30 units of padding.
- If a box is partially cut off by the photo edge, extend the bbox to the edge.

DETECTION RULES:
- One product = one entry. If the same tea appears twice in the photo (e.g. two of the same box), return it twice with distinct bboxes.
- Skip anything that isn't clearly a tea product (hands, table, decor).
- Skip items too small or blurry to read confidently.
- Caffeine defaults: herbal/rooibos "none"; black/pu-erh "medium" to "high"; green/white/oolong "low" to "medium"; matcha "high".

${BRAND_HINTS}

Return ONLY a JSON array. No markdown, no explanation. Example: [{ ... }, { ... }]`;

interface DetectedTea {
  name?: string;
  brand?: string;
  type?: string;
  form?: string;
  caffeine?: string;
  flavorTags?: string[];
  notes?: string;
  bbox?: { yMin?: number; xMin?: number; yMax?: number; xMax?: number };
}

router.post('/analyze-teas-batch', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  if (!getPrimaryGeminiKey()) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });

  try {
    const result = await withGeminiFallback(async (apiKey) => {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: VISION_MODEL });
      return await model.generateContent([
        BATCH_PROMPT,
        { inlineData: { data: req.file!.buffer.toString('base64'), mimeType: req.file!.mimetype } },
      ]);
    });
    const detected = parseLlmJson<DetectedTea[]>(result.response.text());

    if (!Array.isArray(detected) || detected.length === 0) {
      return res.json({ items: [], message: 'No teas detected in this photo.' });
    }

    // EXIF-aware rotation before cropping. Phone cameras store portrait
    // photos as landscape pixels with an orientation tag. Gemini reads
    // the rotated image and returns bboxes in displayed-orientation, but
    // sharp.extract() crops from raw pixels — so we pre-rotate the
    // buffer so the pixel grid matches what Gemini saw.
    const sharp = (await import('sharp')).default;
    const rotatedBuffer = await sharp(req.file.buffer).rotate().toBuffer();
    const metadata = await sharp(rotatedBuffer).metadata();
    const imgWidth = metadata.width || 1000;
    const imgHeight = metadata.height || 1000;
    const rotatedBase64 = rotatedBuffer.toString('base64');

    type OutItem = {
      fields: Omit<DetectedTea, 'bbox'>;
      bbox: { yMin: number; xMin: number; yMax: number; xMax: number };
      imageData: string;
      imageMimeType: string;
    };
    const items: OutItem[] = [];

    for (const item of detected) {
      const bbox = item.bbox;
      const fields: Omit<DetectedTea, 'bbox'> = { ...item };
      delete (fields as DetectedTea).bbox;

      if (!bbox || bbox.yMin == null || bbox.xMin == null || bbox.yMax == null || bbox.xMax == null) {
        items.push({
          fields,
          bbox: { yMin: 0, xMin: 0, yMax: 1000, xMax: 1000 },
          imageData: rotatedBase64,
          imageMimeType: 'image/jpeg',
        });
        continue;
      }

      const PADDING = 20;
      const left = Math.max(0, Math.round((bbox.xMin / 1000) * imgWidth) - PADDING);
      const top = Math.max(0, Math.round((bbox.yMin / 1000) * imgHeight) - PADDING);
      const right = Math.min(imgWidth, Math.round((bbox.xMax / 1000) * imgWidth) + PADDING);
      const bottom = Math.min(imgHeight, Math.round((bbox.yMax / 1000) * imgHeight) + PADDING);
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);

      try {
        const cropped = await sharp(rotatedBuffer)
          .extract({ left, top, width, height })
          .jpeg({ quality: 85 })
          .toBuffer();
        items.push({
          fields,
          bbox: { yMin: bbox.yMin, xMin: bbox.xMin, yMax: bbox.yMax, xMax: bbox.xMax },
          imageData: cropped.toString('base64'),
          imageMimeType: 'image/jpeg',
        });
      } catch (cropErr) {
        console.error(`Failed to crop bbox for "${item.name ?? 'unknown'}":`, cropErr);
        items.push({
          fields,
          bbox: { yMin: bbox.yMin, xMin: bbox.xMin, yMax: bbox.yMax, xMax: bbox.xMax },
          imageData: rotatedBase64,
          imageMimeType: 'image/jpeg',
        });
      }
    }

    res.json({ items, originalWidth: imgWidth, originalHeight: imgHeight });
  } catch (err) {
    console.error('Batch analysis error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Batch analysis failed' });
  }
});

router.post('/analyze-tea', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  if (!getPrimaryGeminiKey()) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });

  try {
    const result = await withGeminiFallback(async (apiKey) => {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: VISION_MODEL });
      return await model.generateContent([
        TEA_ANALYSIS_PROMPT,
        { inlineData: { data: req.file!.buffer.toString('base64'), mimeType: req.file!.mimetype } },
      ]);
    });
    const text = result.response.text();
    const fields = parseLlmJson<{
      name?: string;
      brand?: string;
      type?: string;
      form?: string;
      caffeine?: string;
      flavorTags?: string[];
      notes?: string;
    }>(text);
    res.json(fields);
  } catch (err) {
    console.error('AI analysis error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI analysis failed' });
  }
});

export default router;
