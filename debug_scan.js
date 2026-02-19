const { scanForQR } = require('./virtualrcqrcode');

// Hack to enable console logs in the main script if I hadn't commented them out?
// Actually I'll just copy-paste the logic for quick debugging to see the score.
const sharp = require('sharp');
const path = require('path');

const REFERENCE_QR_PATH = path.join(__dirname, 'fake_rc_qr_ref.png');
const targetPath = 'fake1.jpeg';

async function debug() {
    console.log("Debugging fake1.jpeg...");
    const refMeta = await sharp(REFERENCE_QR_PATH).metadata();
    const patchWidth = Math.floor(refMeta.width * 0.6);
    const patchHeight = Math.floor(refMeta.height * 0.6);
    const patchLeft = Math.floor((refMeta.width - patchWidth) / 2);
    const patchTop = Math.floor((refMeta.height - patchHeight) / 2);

    const targetImage = sharp(targetPath);
    const targetMeta = await targetImage.metadata();
    const targetBuffer = await targetImage.grayscale().raw().toBuffer();
    
    // Check a wider range of scales
    const scales = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2];
    
    for (const scale of scales) {
        const scaledW = Math.floor(patchWidth * scale);
        const scaledH = Math.floor(patchHeight * scale);
        
        if (scaledW > targetMeta.width || scaledH > targetMeta.height) continue;

        let pipe = sharp(REFERENCE_QR_PATH)
                .extract({ left: patchLeft, top: patchTop, width: patchWidth, height: patchHeight });
        if (scaledW !== patchWidth) pipe = pipe.resize(scaledW, scaledH);
        
        const scaledRefBuffer = await pipe.grayscale().raw().toBuffer();

        let bestScaleMSE = Infinity;
        // Search
        for (let y = 0; y <= targetMeta.height - scaledH; y += 4) {
            for (let x = 0; x <= targetMeta.width - scaledW; x += 4) {
                let sumSq = 0;
                let count = 0;
                for (let py = 0; py < scaledH; py += 4) {
                    for (let px = 0; px < scaledW; px += 4) {
                         const diff = targetBuffer[((y + py) * targetMeta.width) + (x + px)] - scaledRefBuffer[(py * scaledW) + px];
                         sumSq += diff * diff;
                         count++;
                    }
                }
                const mse = sumSq / count;
                if (mse < bestScaleMSE) bestScaleMSE = mse;
            }
        }
        console.log(`Scale ${scale}: Best MSE = ${bestScaleMSE.toFixed(2)}`);
    }
}

debug();
