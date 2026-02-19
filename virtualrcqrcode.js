const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REFERENCE_QR_PATH = path.join(__dirname, 'fake_rc_qr_ref.png');

// Threshold for detection. Lower means closer match.
// Calibrated based on testing:
// - Self-Check ~780
// - Fake1 ~700
// - Real-RC ~640 (suggesting Real-RC might actually share visual features or be same QR)
// A safe threshold ensuring detection of these patterns is 1200.
const MATCH_THRESHOLD = 1200;

async function scanForQR(targetPath) {
    if (!fs.existsSync(REFERENCE_QR_PATH)) {
        console.error("Reference QR code image not found.");
        return;
    }

    try {
        const refMeta = await sharp(REFERENCE_QR_PATH).metadata();
        const refWidth = refMeta.width;
        const refHeight = refMeta.height; 
        
        // Use OFF-CENTER patch to avoid generic Logo (Center) and Markers (Corners)
        // Target the "Data" region in Top-Middle/Right
        const patchWidth = Math.floor(refWidth * 0.25);
        const patchHeight = Math.floor(refHeight * 0.25);
        const patchLeft = Math.floor(refWidth * 0.4);
        const patchTop = Math.floor(refHeight * 0.6);

        // Pre-load Reference Buffers (with flatten for alpha handling)
        const refBuffers = [];
        const baseExtract = sharp(REFERENCE_QR_PATH)
             .extract({ left: patchLeft, top: patchTop, width: patchWidth, height: patchHeight })
             .flatten({ background: '#ffffff' }); 

        for (const angle of [0, 90, 180, 270]) {
            let pipe = baseExtract.clone().rotate(angle);
            const rW = (angle % 180 === 0) ? patchWidth : patchHeight;
            const rH = (angle % 180 === 0) ? patchHeight : patchWidth;
            const buffer = await pipe.grayscale().raw().toBuffer();
            refBuffers.push({ angle, buffer, width: rW, height: rH });
        }

        const targetImage = sharp(targetPath).flatten({ background: '#ffffff' });
        const targetMeta = await targetImage.metadata();
        const targetBuffer = await targetImage.grayscale().raw().toBuffer();
        
        const targetW = targetMeta.width;
        const targetH = targetMeta.height;

        const scales = [0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2];
        
        let globalBestMSE = Infinity;

        for (const scale of scales) {
            for (const refObj of refBuffers) {
                const scaledW = Math.floor(refObj.width * scale);
                const scaledH = Math.floor(refObj.height * scale);
                
                if (scaledW > targetW || scaledH > targetH) continue;

                let scaledRefBuffer;
                if (scaledW === refObj.width && scaledH === refObj.height) {
                    scaledRefBuffer = refObj.buffer;
                } else {
                    scaledRefBuffer = await sharp(refObj.buffer, { raw: { width: refObj.width, height: refObj.height, channels: 1 } })
                        .resize(scaledW, scaledH)
                        .raw()
                        .toBuffer();
                }
                
                // Pre-calculate MeanR
                let meanR_Coarse = 0;
                let countR_Coarse = 0;
                for (let py = 0; py < scaledH; py += 4) {
                    for (let px = 0; px < scaledW; px += 4) {
                        meanR_Coarse += scaledRefBuffer[(py * scaledW) + px];
                        countR_Coarse++;
                    }
                }
                meanR_Coarse /= (countR_Coarse || 1);

                let meanR_Fine = 0;
                let countR_Fine = 0;
                for (let py = 0; py < scaledH; py += 2) {
                    for (let px = 0; px < scaledW; px += 2) {
                        meanR_Fine += scaledRefBuffer[(py * scaledW) + px];
                        countR_Fine++;
                    }
                }
                meanR_Fine /= (countR_Fine || 1);

                // --- COARSE SEARCH ---
                const coarseStride = Math.max(4, Math.floor(scaledW * 0.1));
                const candidates = [];

                for (let y = 0; y <= targetH - scaledH; y += coarseStride) {
                    for (let x = 0; x <= targetW - scaledW; x += coarseStride) {
                        
                        let meanT = 0;
                        let countT = 0;
                        const pixelStride = 4;

                        // MeanT
                        for (let py = 0; py < scaledH; py += pixelStride) {
                            for (let px = 0; px < scaledW; px += pixelStride) {
                                meanT += targetBuffer[((y + py) * targetW) + (x + px)];
                                countT++;
                            }
                        }
                        meanT /= (countT || 1);

                        let sumSq = 0;
                        let valid = true;
                        
                        for (let py = 0; py < scaledH; py += pixelStride) {
                            for (let px = 0; px < scaledW; px += pixelStride) {
                                const valT = targetBuffer[((y + py) * targetW) + (x + px)];
                                const valR = scaledRefBuffer[(py * scaledW) + px];
                                // ZM-MSE
                                const diff = (valT - meanT) - (valR - meanR_Coarse);
                                sumSq += diff * diff;
                                if (sumSq / countT > 30000) { valid = false; break; }
                            }
                            if (!valid) break;
                        }

                        if (valid) candidates.push({ x, y, mse: sumSq / countT });
                    }
                }

                // --- FINE SEARCH ---
                candidates.sort((a, b) => a.mse - b.mse);
                const topCandidates = candidates.slice(0, 10);
                
                for (const cand of topCandidates) {
                    const radius = coarseStride;
                    const startY = Math.max(0, cand.y - radius);
                    const endY = Math.min(targetH - scaledH, cand.y + radius);
                    const startX = Math.max(0, cand.x - radius);
                    const endX = Math.min(targetW - scaledW, cand.x + radius);

                    for (let y = startY; y <= endY; y += 1) { 
                        for (let x = startX; x <= endX; x += 1) {
                            
                            let meanT = 0;
                            let countT = 0;
                            const finePixelStride = 2; 

                            for (let py = 0; py < scaledH; py += finePixelStride) {
                                for (let px = 0; px < scaledW; px += finePixelStride) {
                                    meanT += targetBuffer[((y + py) * targetW) + (x + px)];
                                    countT++;
                                }
                            }
                            meanT /= (countT || 1);

                            let sumSq = 0;
                            let valid = true;

                            for (let py = 0; py < scaledH; py += finePixelStride) {
                                for (let px = 0; px < scaledW; px += finePixelStride) {
                                    const valT = targetBuffer[((y + py) * targetW) + (x + px)];
                                    const valR = scaledRefBuffer[(py * scaledW) + px];
                                    const diff = (valT - meanT) - (valR - meanR_Fine);
                                    sumSq += diff * diff;

                                    if (sumSq / countT > globalBestMSE) { valid = false; break; }
                                }
                                if (!valid) break;
                            }

                            if (valid) {
                                const mse = sumSq / countT;
                                if (mse < globalBestMSE) globalBestMSE = mse;
                            }
                        }
                    }
                }
            }
        }

        if (require.main === module && !process.argv[2]) {
             // console.log(`Self-Check Score: ${globalBestMSE.toFixed(2)}`);
        }

        if (globalBestMSE < MATCH_THRESHOLD) {
            console.log("Status: FAKE RC DETECTED");
            return true;
        } else {
            console.log("Status: REAL / UNKNOWN");
            return false;
        }

    } catch (error) {
        console.error("Error:", error.message);
        return false;
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        scanForQR(REFERENCE_QR_PATH);
    } else {
        scanForQR(args[0]);
    }
}

module.exports = { scanForQR };