const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

const inDir = 'C:\\Users\\diego\\.gemini\\antigravity\\brain\\0c173467-e401-4c91-94e7-f348ae28498c';
const outDir = 'C:\\Users\\diego\\Downloads\\aplicaciónhabify\\assets\\sprites';

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// Map from the generated file prefix to standard name
const filesPattern = [
    { prefix: 'pet_trex', name: 'pet_trex.png' },
    { prefix: 'pet_dragon', name: 'pet_dragon.png' },
    { prefix: 'pet_cat', name: 'pet_cat.png' },
    { prefix: 'pet_phoenix', name: 'pet_phoenix.png' }
];

// Determine color distance
function colorDist(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt(Math.pow(r1-r2, 2) + Math.pow(g1-g2, 2) + Math.pow(b1-b2, 2));
}

async function processImage(fileName, targetName) {
    const fullIn = path.join(inDir, fileName);
    const fullOut = path.join(outDir, targetName);
    
    try {
        const image = await Jimp.read(fullIn);
        
        let bgColor = Jimp.intToRGBA(image.getPixelColor(10, 10));
        let baseR = bgColor.r, baseG = bgColor.g, baseB = bgColor.b;

        if (baseG < 100) { baseG = 255; baseR = 0; baseB = 0; } // fallback

        const threshold = 120; 

        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];

            const dist = colorDist(r, g, b, baseR, baseG, baseB);
            
            if (dist < threshold || (g > 150 && r < 100 && b < 100)) {
                this.bitmap.data[idx + 3] = 0; // Transparent
            }
        });

        image.autocrop({tolerance: 0.1, cropOnlyFrames: false});
        image.scale(0.5, Jimp.RESIZE_NEAREST_NEIGHBOR);

        await image.writeAsync(fullOut);
        console.log(`Processed ${fileName} -> ${targetName}`);
    } catch (e) {
        console.error(`Error on ${fileName}:`, e.message);
    }
}

async function main() {
    const allFiles = fs.readdirSync(inDir);
    
    for (let mapping of filesPattern) {
        const matchedFiles = allFiles
            .filter(f => f.startsWith(mapping.prefix) && f.endsWith('.png'))
            .sort((a,b) => fs.statSync(path.join(inDir, b)).mtimeMs - fs.statSync(path.join(inDir, a)).mtimeMs);
            
        if (matchedFiles.length > 0) {
            await processImage(matchedFiles[0], mapping.name);
        } else {
            console.log(`Missing generated image for ${mapping.prefix}`);
        }
    }
}

main().then(() => console.log('Done!'));
