import fs from "fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// Cargar imágenes
const bigImage = PNG.sync.read(fs.readFileSync("fullpage.png"));     // imagen completa
const smallImage = PNG.sync.read(fs.readFileSync("envio.png"));  // imagen a buscar

const { width: bigW, height: bigH } = bigImage;
const { width: smallW, height: smallH } = smallImage;

let foundCoords = null;

for (let y = 0; y <= bigH - smallH; y++) {
  for (let x = 0; x <= bigW - smallW; x++) {
    const crop = new PNG({ width: smallW, height: smallH });

    for (let j = 0; j < smallH; j++) {
      const start = ((y + j) * bigW + x) << 2;
      const end = start + (smallW << 2);
      const row = bigImage.data.slice(start, end);
      row.copy(crop.data, j * smallW * 4);
    }

    const diff = pixelmatch(smallImage.data, crop.data, null, smallW, smallH, { threshold: 0.1 });
    const mismatchRatio = diff / (smallW * smallH);

    if (mismatchRatio < 0.05) {
      foundCoords = { x, y };
      break;
    }
  }
  if (foundCoords) break;
}

if (foundCoords) {
  console.log(`✅ Imagen encontrada en: x=${foundCoords.x}, y=${foundCoords.y}`);
} else {
  console.log("❌ Imagen no encontrada.");
}
