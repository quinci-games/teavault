// Procedurally generates the TeaVault PWA icons via jimp.
//
// Outputs into client/public/:
//   icon-192.png            standard PWA icon (square, with wordmark)
//   icon-512.png            larger PWA icon (square, with wordmark)
//   icon-maskable-512.png   full-bleed maskable variant for Android
//
// Implementation note: we render the leaf using BACKWARD-MAPPED coords
// (iterate destination pixels, inverse-rotate to local leaf frame, test
// shape inclusion). Forward-mapping had nasty rotation aliasing that
// turned the leaf into a checker pattern.

const Jimp = require('jimp');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'client', 'public');

const BG       = Jimp.cssColorToHex('#0f2010'); // tea-950
const LEAF     = Jimp.cssColorToHex('#70a968'); // tea-400
const LEAF_HI  = Jimp.cssColorToHex('#9cc796'); // tea-300
const VEIN     = Jimp.cssColorToHex('#3c7236'); // tea-600

function setPixelSafe(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) return;
  img.setPixelColor(c, Math.round(x), Math.round(y));
}
function fillCircle(img, cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.sqrt(r * r - dy * dy);
    for (let dx = -w; dx <= w; dx++) {
      setPixelSafe(img, cx + dx, cy + dy, color);
    }
  }
}

/**
 * Draw a tea-leaf teardrop centered at (cx,cy), pointing along +X locally
 * but rotated by angleRad in destination space. Backward-mapped.
 */
function drawLeaf(img, cx, cy, length, width, angleRad, fillColor, hiColor, veinColor) {
  const halfL = length / 2;
  const halfW = width / 2;
  const reach = Math.ceil(Math.max(length, width) / 2 + 2);
  const cosA = Math.cos(-angleRad);
  const sinA = Math.sin(-angleRad);

  // Backward map every destination pixel within the bounding circle.
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      // Inverse rotation: rotate destination offset by -angle to get the
      // corresponding point in the leaf's local frame.
      const lx = dx * cosA - dy * sinA;
      const ly = dx * sinA + dy * cosA;

      // t: 0 at base (lx = -halfL), 1 at tip (lx = +halfL)
      const t = (lx + halfL) / length;
      if (t <= 0 || t >= 1) continue;

      // Width profile peaks ~35% from base, tapers to point at tip and
      // rounds at base. Pow(t, 0.7) biases the peak toward the base.
      const profile = Math.sin(Math.PI * Math.pow(t, 0.7));
      const maxW = profile * halfW;
      if (Math.abs(ly) > maxW) continue;

      // Highlight band along the upper edge (in local +X-pointing frame
      // that means smaller ly, since we're flipped). Soft so it's not
      // a hard stripe.
      const upperFactor = -ly / Math.max(maxW, 1); // 1 at top edge, -1 at bottom
      const isHighlight = upperFactor > 0.55 && t > 0.1 && t < 0.92;
      const color = isHighlight ? hiColor : fillColor;

      setPixelSafe(img, cx + dx, cy + dy, color);
    }
  }

  // Center vein along local X axis, drawn in destination space.
  const veinSteps = Math.ceil(length * 1.2);
  for (let i = 0; i <= veinSteps; i++) {
    const lx = -halfL * 0.85 + (i / veinSteps) * length * 0.85;
    // Forward-map this single line — sampling density isn't an issue
    // for a 2-pixel line.
    const dxRot = lx * Math.cos(angleRad);
    const dyRot = lx * Math.sin(angleRad);
    setPixelSafe(img, cx + dxRot, cy + dyRot, veinColor);
    // Thicken perpendicular to the vein for readability
    setPixelSafe(img, cx + dxRot - Math.sin(angleRad), cy + dyRot + Math.cos(angleRad), veinColor);
  }
}

async function makeIcon(size, { withWordmark, fullBleed }) {
  const img = new Jimp(size, size, BG);

  const cx = size / 2;
  const leafCy = withWordmark ? size * 0.42 : size * 0.50;
  const leafLen = fullBleed ? size * 0.78 : (withWordmark ? size * 0.62 : size * 0.66);
  const leafWid = leafLen * 0.46;
  const angle = -Math.PI / 180 * 25; // tilt up-right

  drawLeaf(img, cx, leafCy, leafLen, leafWid, angle, LEAF, LEAF_HI, VEIN);

  // Tiny dew-drop accent near the tip for visual punch (skip on maskable
  // to avoid clipping)
  if (!fullBleed) {
    const tipDx = (leafLen / 2 - 4) * Math.cos(angle);
    const tipDy = (leafLen / 2 - 4) * Math.sin(angle);
    fillCircle(img, cx + tipDx + size * 0.02, leafCy + tipDy - size * 0.025,
               Math.max(2, Math.round(size * 0.022)), LEAF_HI);
  }

  if (withWordmark) {
    // White bitmap font, no recolor pass — white reads clearly on the
    // dark green background.
    const fontKey = size >= 384
      ? Jimp.FONT_SANS_64_WHITE
      : (size >= 192 ? Jimp.FONT_SANS_32_WHITE : Jimp.FONT_SANS_16_WHITE);
    const font = await Jimp.loadFont(fontKey);
    const text = 'TEAVAULT';
    const textW = Jimp.measureText(font, text);
    const textX = Math.round((size - textW) / 2);
    const textY = Math.round(size * 0.76);
    img.print(font, textX, textY, text);
  }

  return img;
}

(async () => {
  console.log('Generating PWA icons…');

  const i192 = await makeIcon(192, { withWordmark: true,  fullBleed: false });
  await i192.writeAsync(path.join(OUT_DIR, 'icon-192.png'));
  console.log('  ✓ icon-192.png');

  const i512 = await makeIcon(512, { withWordmark: true,  fullBleed: false });
  await i512.writeAsync(path.join(OUT_DIR, 'icon-512.png'));
  console.log('  ✓ icon-512.png');

  const iMask = await makeIcon(512, { withWordmark: false, fullBleed: true });
  await iMask.writeAsync(path.join(OUT_DIR, 'icon-maskable-512.png'));
  console.log('  ✓ icon-maskable-512.png');

  console.log('Done.');
})().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
