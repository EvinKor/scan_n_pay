const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../public/animal_picture.png');
const outputDir = path.join(__dirname, '../public/Animal');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const ANIMAL_NAMES = [
  "lion", "tiger", "bear", "frog", "pig", 
  "monkey", "fox", "dog", "cat", "rabbit", 
  "panda", "koala", "chicken", "penguin", "owl", 
  "unicorn", "dragon", "trex", "octopus", "dolphin"
];

async function cropAnimals() {
  console.log('Loading image...');
  const image = await Jimp.read(inputPath);
  
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  
  const cellWidth = Math.floor(width / 5);
  const cellHeight = Math.floor(height / 4);
  
  console.log(`Grid size: ${width}x${height}, Cell size: ${cellWidth}x${cellHeight}`);
  
  for (let i = 0; i < 20; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    
    const x = col * cellWidth;
    const y = row * cellHeight;
    
    console.log(`Cropping ${ANIMAL_NAMES[i]} at ${x},${y}...`);
    
    const clone = image.clone();
    
    // Crop the cell
    clone.crop({ x, y, w: cellWidth, h: cellHeight });
    
    const outPath = path.join(outputDir, `${ANIMAL_NAMES[i]}.png`);
    
    await clone.write(outPath);
    console.log(`Saved ${ANIMAL_NAMES[i]}.png`);
  }
}

cropAnimals().then(() => {
  console.log('All done!');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
