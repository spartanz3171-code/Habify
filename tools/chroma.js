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
    { prefix: 'hero_sprite', name: 'hero.png' },
    { prefix: 'mage_sprite', name: 'mage.png' },
    { prefix: 'knight_sprite', name: 'knight.png' },
    { prefix: 'elf_sprite', name: 'elf.png' },
    { prefix: 'goblin_sprite', name: 'goblin.png' },
    { prefix: 'skeleton_sprite', name: 'skeleton.png' },
    { prefix: 'slime_sprite', name: 'slime.png' },
    { prefix: 'orc_sprite', name: 'orc.png' },
    { prefix: 'ghost_sprite', name: 'ghost.png' }
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
        
        // Find dominant background color by sampling top-left pixel
        // DALL-E green is usually around 0, 255, 0 but could be slightly off
        const bgColor = Jimp.intToRGBA(image.getPixelColor(10, 10));
        let baseR = bgColor.r, baseG = bgColor.g, baseB = bgColor.b;

        // Ensure it's somewhat green to be safe
        if (baseG < 100) { baseG = 255; baseR = 0; baseB = 0; } // fallback

        // A threshold distance for a color to be considered the bg color
        const threshold = 120; 

        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];

            const dist = colorDist(r, g, b, baseR, baseG, baseB);
            
            // If it's a strongly green pixel
            if (dist < threshold || (g > 150 && r < 100 && b < 100)) {
                this.bitmap.data[idx + 3] = 0; // Transparent
            }
        });

        // Crop it tightly
        image.autocrop({tolerance: 0.1, cropOnlyFrames: false});
        // Scale it down (if DALL-E generated 1024x1024, down to 128x128 for crispy pixels)
        // No wait, let's keep it big and let CSS rescale it nicely.
        // Wait, for crisp pixel art, keeping original DALL-E is better. 
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
        // find most recently generated file for this prefix
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
