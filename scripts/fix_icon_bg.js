const { Jimp } = require('jimp');
const path = require('path');

async function fixIcon() {
  const iconPath = path.join(__dirname, 'public/app_icon.png');
  const image = await Jimp.read(iconPath);
  
  // Create a new image filled with the app's dark background color (#0A0D0A)
  // In Jimp v1, Jimp.create is typically used, but `new Jimp` might work.
  // Actually, let's just color the background by scanning all pixels and if alpha is 0, make it #0A0D0A.
  
  image.scan((x, y, idx) => {
    const alpha = image.bitmap.data[idx + 3];
    if (alpha < 255) {
      // If transparent, blend with #0A0D0A (R=10, G=13, B=10)
      const r = image.bitmap.data[idx];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      
      const factor = alpha / 255;
      const inv = 1 - factor;
      
      image.bitmap.data[idx] = Math.round(r * factor + 10 * inv);
      image.bitmap.data[idx + 1] = Math.round(g * factor + 13 * inv);
      image.bitmap.data[idx + 2] = Math.round(b * factor + 10 * inv);
      image.bitmap.data[idx + 3] = 255; // Set alpha to fully opaque
    }
  });

  await image.write(iconPath);
  console.log('Done! Icon background is now dark.');
}

fixIcon().catch(console.error);
