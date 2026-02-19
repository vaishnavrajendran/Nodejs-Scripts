const sharp = require('sharp');
const path = require('path');

const REFERENCE_QR_PATH = path.join(__dirname, 'fake_rc_qr_ref.png');
const targetPath = 'fake1.jpeg';

async function debugNCC() {
    console.log("Debugging NCC on fake1.jpeg...");
    const refMeta = await sharp(REFERENCE_QR_PATH).metadata();
    const patchWidth = Math.floor(refMeta.width * 0.6);
    const patchHeight = Math.floor(refMeta.height * 0.6);
    const patchLeft = Math.floor((refMeta.width - patchWidth) / 2);
    const patchTop = Math.floor((refMeta.height - patchHeight) / 2);

    const targetImage = sharp(targetPath);
    const targetMeta = await targetImage.metadata();
    const targetBuffer = await targetImage.grayscale().raw().toBuffer();
    
    // Scales to check around 0.2
    const scales = [0.15, 0.2, 0.25, 0.3, 0.35];
    
    for (const scale of scales) {
        const scaledW = Math.floor(patchWidth * scale);
        const scaledH = Math.floor(patchHeight * scale);
        
        let pipe = sharp(REFERENCE_QR_PATH)
                .extract({ left: patchLeft, top: patchTop, width: patchWidth, height: patchHeight })
                .resize(scaledW, scaledH);
        
        const scaledRefBuffer = await pipe.grayscale().raw().toBuffer();

        // Normalize Template
        let meanR = 0;
        for(let i=0; i<scaledRefBuffer.length; i++) meanR += scaledRefBuffer[i];
        meanR /= scaledRefBuffer.length;
        
        // Stdev Template
        let sumSqDiffR = 0;
        for(let i=0; i<scaledRefBuffer.length; i++) sumSqDiffR += (scaledRefBuffer[i] - meanR)**2;
        const stdR = Math.sqrt(sumSqDiffR / scaledRefBuffer.length) || 1;

        let bestCorr = -1; // Correlation ranges from -1 to 1

        for (let y = 0; y <= targetMeta.height - scaledH; y += 2) {
            for (let x = 0; x <= targetMeta.width - scaledW; x += 2) {
                
                // Extract Window Stats
                let meanT = 0;
                let count = 0;
                // Fast pass for mean
                for (let py = 0; py < scaledH; py += 2) {
                    for (let px = 0; px < scaledW; px += 2) {
                        meanT += targetBuffer[((y + py) * targetMeta.width) + (x + px)];
                        count++;
                    }
                }
                meanT /= count;

                // Covariance & StdevT
                let cov = 0;
                let sumSqDiffT = 0;
                
                for (let py = 0; py < scaledH; py += 2) {
                    for (let px = 0; px < scaledW; px += 2) {
                         const valT = targetBuffer[((y + py) * targetMeta.width) + (x + px)];
                         const valR = scaledRefBuffer[(py * scaledW) + px]; // Approximate index alignment for stride
                         
                         const diffT = valT - meanT;
                         const diffR = valR - meanR; // Note: using pre-calc meanR might be slightly off due to stride but ok
                         
                         cov += diffT * diffR;
                         sumSqDiffT += diffT * diffT;
                    }
                }
                
                const stdT = Math.sqrt(sumSqDiffT / count) || 1;
                // We need to adjust stdR for stride as well efficiently, but let's just approximate
                // Ideally we normalize inputs first.
                // Pearson Correlation = Cov(X,Y) / (sigmaX * sigmaY)
                
                // Let's assume stdR is constant for the patch.
                const corr = (cov / count) / (stdT * stdR);
                
                if (corr > bestCorr) bestCorr = corr;
            }
        }
        console.log(`Scale ${scale}: Best Correlation = ${bestCorr.toFixed(4)}`);
    }
}

debugNCC();
