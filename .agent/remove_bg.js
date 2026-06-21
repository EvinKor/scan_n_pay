const { Jimp } = require('jimp');
const path = require('path');

const inputPath = path.join(__dirname, '../public/animal_picture.png');

async function removeWhiteBg() {
  console.log('Loading image...');
  let image;
  try {
    image = await Jimp.read(inputPath);
  } catch (e) {
    const jimpOld = require('jimp');
    image = await jimpOld.read(inputPath);
  }
  
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  
  const colorDistance = (c1, c2) => {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  };
  
  const white = { r: 255, g: 255, b: 255 };
  
  console.log('Processing pixels...');
  image.scan(0, 0, width, height, function(x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    
    if (colorDistance({ r, g, b }, white) < 40) {
      this.bitmap.data[idx + 3] = 0;
    }
  });
  
  console.log('Saving transparent image...');
  return new Promise((resolve, reject) => {
    image.write(inputPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

removeWhiteBg().then(() => console.log('Done!')).catch(console.error);
