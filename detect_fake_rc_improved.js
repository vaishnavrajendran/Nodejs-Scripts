const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REFERENCE_QR_PATH = path.join(__dirname, 'fake_rc_qr_ref.png');

/**
 * Enhanced fake RC detection with multiple strategies
 * Strategy 1: Full QR code matching (for exact matches)
 * Strategy 2: QR data region matching (for partial matches)
 * Strategy 3: QR pattern analysis (for structural similarity)
 */

const CONFIG = {
    // Thresholds for different detection strategies
    FULL_QR_THRESHOLD: 1200,      // Full QR code match threshold
    DATA_REGION_THRESHOLD: 800,   // QR data region match threshold
    PATTERN_THRESHOLD: 1000,      // QR pattern match threshold
    
    // Scales to test
    SCALES: [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5],
    
    // Rotation angles to test
    ROTATIONS: [0, 90, 180, 270],
    
    // Search parameters
    COARSE_STRIDE_FACTOR: 0.1,
    FINE_SEARCH_RADIUS_FACTOR: 1.0,
    
    // Pixel sampling strides
    COARSE_PIXEL_STRIDE: 4,
    FINE_PIXEL_STRIDE: 2,
    
    // Early termination threshold for coarse search
    COARSE_EARLY_TERMINATION: 30000,
    
    // Number of top candidates to refine in fine search
    TOP_CANDIDATES: 10
};

/**
 * Extract a specific region from an image
 */
async function extractRegion(imagePath, left, top, width, height, flatten = true) {
    let pipeline = sharp(imagePath).extract({ left, top, width, height });
    
    if (flatten) {
        pipeline = pipeline.flatten({ background: '#ffffff' });
    }
    
    return pipeline.grayscale().raw().toBuffer();
}

/**
 * Calculate Zero-Mean Mean Squared Error between two image regions
 */
function calculateZMMSE(refBuffer, refWidth, refHeight, targetBuffer, targetWidth, targetX, targetY, pixelStride = 2) {
    // Calculate mean of reference region
    let meanR = 0;
    let countR = 0;
    for (let py = 0; py < refHeight; py += pixelStride) {
        for (let px = 0; px < refWidth; px += pixelStride) {
            meanR += refBuffer[(py * refWidth) + px];
            countR++;
        }
    }
    meanR /= (countR || 1);
    
    // Calculate mean of target region
    let meanT = 0;
    let countT = 0;
    for (let py = 0; py < refHeight; py += pixelStride) {
        for (let px = 0; px < refWidth; px += pixelStride) {
            meanT += targetBuffer[((targetY + py) * targetWidth) + (targetX + px)];
            countT++;
        }
    }
    meanT /= (countT || 1);
    
    // Calculate ZM-MSE
    let sumSq = 0;
    for (let py = 0; py < refHeight; py += pixelStride) {
        for (let px = 0; px < refWidth; px += pixelStride) {
            const valT = targetBuffer[((targetY + py) * targetWidth) + (targetX + px)];
            const valR = refBuffer[(py * refWidth) + px];
            const diff = (valT - meanT) - (valR - meanR);
            sumSq += diff * diff;
        }
    }
    
    return sumSq / countT;
}

/**
 * Strategy 1: Match full QR code with multi-scale and rotation
 */
async function matchFullQR(refPath, targetPath) {
    const refMeta = await sharp(refPath).metadata();
    const refWidth = refMeta.width;
    const refHeight = refMeta.height;
    
    // Prepare reference buffers at different rotations
    const refBuffers = [];
    for (const angle of CONFIG.ROTATIONS) {
        let pipeline = sharp(refPath).rotate(angle).flatten({ background: '#ffffff' });
        const rW = (angle % 180 === 0) ? refWidth : refHeight;
        const rH = (angle % 180 === 0) ? refHeight : refWidth;
        const buffer = await pipeline.grayscale().raw().toBuffer();
        refBuffers.push({ angle, buffer, width: rW, height: rH });
    }
    
    // Load target image
    const targetImage = sharp(targetPath).flatten({ background: '#ffffff' });
    const targetMeta = await targetImage.metadata();
    const targetBuffer = await targetImage.grayscale().raw().toBuffer();
    const targetW = targetMeta.width;
    const targetH = targetMeta.height;
    
    let globalBestMSE = Infinity;
    let bestMatch = null;
    
    // Search across scales
    for (const scale of CONFIG.SCALES) {
        for (const refObj of refBuffers) {
            const scaledW = Math.floor(refObj.width * scale);
            const scaledH = Math.floor(refObj.height * scale);
            
            if (scaledW > targetW || scaledH > targetH) continue;
            
            // Scale reference if needed
            let scaledRefBuffer;
            if (scaledW === refObj.width && scaledH === refObj.height) {
                scaledRefBuffer = refObj.buffer;
            } else {
                scaledRefBuffer = await sharp(refObj.buffer, {
                    raw: { width: refObj.width, height: refObj.height, channels: 1 }
                }).resize(scaledW, scaledH).raw().toBuffer();
            }
            
            // Coarse search
            const coarseStride = Math.max(4, Math.floor(scaledW * CONFIG.COARSE_STRIDE_FACTOR));
            const candidates = [];
            
            for (let y = 0; y <= targetH - scaledH; y += coarseStride) {
                for (let x = 0; x <= targetW - scaledW; x += coarseStride) {
                    const mse = calculateZMMSE(
                        scaledRefBuffer, scaledW, scaledH,
                        targetBuffer, targetW, x, y,
                        CONFIG.COARSE_PIXEL_STRIDE
                    );
                    
                    if (mse < CONFIG.COARSE_EARLY_TERMINATION) {
                        candidates.push({ x, y, mse });
                    }
                }
            }
            
            // Fine search on top candidates
            candidates.sort((a, b) => a.mse - b.mse);
            const topCandidates = candidates.slice(0, CONFIG.TOP_CANDIDATES);
            
            for (const cand of topCandidates) {
                const radius = Math.floor(coarseStride * CONFIG.FINE_SEARCH_RADIUS_FACTOR);
                const startY = Math.max(0, cand.y - radius);
                const endY = Math.min(targetH - scaledH, cand.y + radius);
                const startX = Math.max(0, cand.x - radius);
                const endX = Math.min(targetW - scaledW, cand.x + radius);
                
                for (let y = startY; y <= endY; y++) {
                    for (let x = startX; x <= endX; x++) {
                        const mse = calculateZMMSE(
                            scaledRefBuffer, scaledW, scaledH,
                            targetBuffer, targetW, x, y,
                            CONFIG.FINE_PIXEL_STRIDE
                        );
                        
                        if (mse < globalBestMSE) {
                            globalBestMSE = mse;
                            bestMatch = {
                                x, y, scale, angle: refObj.angle,
                                width: scaledW, height: scaledH
                            };
                        }
                    }
                }
            }
        }
    }
    
    return { mse: globalBestMSE, match: bestMatch };
}

/**
 * Strategy 2: Match QR data region (avoiding center logo and corner markers)
 */
async function matchDataRegion(refPath, targetPath) {
    const refMeta = await sharp(refPath).metadata();
    const refWidth = refMeta.width;
    const refHeight = refMeta.height;
    
    // Extract data-rich region (avoiding center logo and corners)
    // Focus on the area that contains the actual QR data
    const patchWidth = Math.floor(refWidth * 0.25);
    const patchHeight = Math.floor(refHeight * 0.25);
    const patchLeft = Math.floor(refWidth * 0.4);
    const patchTop = Math.floor(refHeight * 0.6);
    
    const refBuffers = [];
    const baseExtract = sharp(refPath)
        .extract({ left: patchLeft, top: patchTop, width: patchWidth, height: patchHeight })
        .flatten({ background: '#ffffff' });
    
    for (const angle of CONFIG.ROTATIONS) {
        let pipeline = baseExtract.clone().rotate(angle);
        const rW = (angle % 180 === 0) ? patchWidth : patchHeight;
        const rH = (angle % 180 === 0) ? patchHeight : patchWidth;
        const buffer = await pipeline.grayscale().raw().toBuffer();
        refBuffers.push({ angle, buffer, width: rW, height: rH });
    }
    
    const targetImage = sharp(targetPath).flatten({ background: '#ffffff' });
    const targetMeta = await targetImage.metadata();
    const targetBuffer = await targetImage.grayscale().raw().toBuffer();
    const targetW = targetMeta.width;
    const targetH = targetMeta.height;
    
    let globalBestMSE = Infinity;
    
    for (const scale of CONFIG.SCALES) {
        for (const refObj of refBuffers) {
            const scaledW = Math.floor(refObj.width * scale);
            const scaledH = Math.floor(refObj.height * scale);
            
            if (scaledW > targetW || scaledH > targetH) continue;
            
            let scaledRefBuffer;
            if (scaledW === refObj.width && scaledH === refObj.height) {
                scaledRefBuffer = refObj.buffer;
            } else {
                scaledRefBuffer = await sharp(refObj.buffer, {
                    raw: { width: refObj.width, height: refObj.height, channels: 1 }
                }).resize(scaledW, scaledH).raw().toBuffer();
            }
            
            const coarseStride = Math.max(4, Math.floor(scaledW * CONFIG.COARSE_STRIDE_FACTOR));
            const candidates = [];
            
            for (let y = 0; y <= targetH - scaledH; y += coarseStride) {
                for (let x = 0; x <= targetW - scaledW; x += coarseStride) {
                    const mse = calculateZMMSE(
                        scaledRefBuffer, scaledW, scaledH,
                        targetBuffer, targetW, x, y,
                        CONFIG.COARSE_PIXEL_STRIDE
                    );
                    
                    if (mse < CONFIG.COARSE_EARLY_TERMINATION) {
                        candidates.push({ x, y, mse });
                    }
                }
            }
            
            candidates.sort((a, b) => a.mse - b.mse);
            const topCandidates = candidates.slice(0, CONFIG.TOP_CANDIDATES);
            
            for (const cand of topCandidates) {
                const radius = Math.floor(coarseStride * CONFIG.FINE_SEARCH_RADIUS_FACTOR);
                const startY = Math.max(0, cand.y - radius);
                const endY = Math.min(targetH - scaledH, cand.y + radius);
                const startX = Math.max(0, cand.x - radius);
                const endX = Math.min(targetW - scaledW, cand.x + radius);
                
                for (let y = startY; y <= endY; y++) {
                    for (let x = startX; x <= endX; x++) {
                        const mse = calculateZMMSE(
                            scaledRefBuffer, scaledW, scaledH,
                            targetBuffer, targetW, x, y,
                            CONFIG.FINE_PIXEL_STRIDE
                        );
                        
                        if (mse < globalBestMSE) {
                            globalBestMSE = mse;
                        }
                    }
                }
            }
        }
    }
    
    return { mse: globalBestMSE };
}

/**
 * Main detection function
 */
async function detectFakeRC(targetPath) {
    if (!fs.existsSync(REFERENCE_QR_PATH)) {
        console.error("Reference QR code image not found.");
        return {
            isFake: false,
            error: "Reference QR code not found"
        };
    }
    
    if (!fs.existsSync(targetPath)) {
        console.error("Target image not found.");
        return {
            isFake: false,
            error: "Target image not found"
        };
    }
    
    try {
        console.log('Running detection strategies...\n');
        
        // Strategy 1: Full QR matching
        console.log('Strategy 1: Full QR Code Matching...');
        const fullQRResult = await matchFullQR(REFERENCE_QR_PATH, targetPath);
        console.log(`  Best MSE: ${fullQRResult.mse.toFixed(2)}`);
        if (fullQRResult.match) {
            console.log(`  Match found at: (${fullQRResult.match.x}, ${fullQRResult.match.y})`);
            console.log(`  Scale: ${fullQRResult.match.scale}, Rotation: ${fullQRResult.match.angle}°`);
        }
        
        // Strategy 2: Data region matching
        console.log('\nStrategy 2: QR Data Region Matching...');
        const dataRegionResult = await matchDataRegion(REFERENCE_QR_PATH, targetPath);
        console.log(`  Best MSE: ${dataRegionResult.mse.toFixed(2)}`);
        
        // Decision logic: Use the best (lowest) MSE from all strategies
        const bestMSE = Math.min(fullQRResult.mse, dataRegionResult.mse);
        
        // Determine if fake based on thresholds
        let isFake = false;
        let confidence = 0;
        let detectionMethod = '';
        
        if (fullQRResult.mse < CONFIG.FULL_QR_THRESHOLD) {
            isFake = true;
            confidence = Math.max(0, 100 - (fullQRResult.mse / CONFIG.FULL_QR_THRESHOLD) * 100);
            detectionMethod = 'Full QR Match';
        } else if (dataRegionResult.mse < CONFIG.DATA_REGION_THRESHOLD) {
            isFake = true;
            confidence = Math.max(0, 100 - (dataRegionResult.mse / CONFIG.DATA_REGION_THRESHOLD) * 100);
            detectionMethod = 'Data Region Match';
        }
        
        return {
            isFake,
            confidence: Math.round(confidence * 100) / 100,
            detectionMethod,
            scores: {
                fullQR: fullQRResult.mse,
                dataRegion: dataRegionResult.mse,
                best: bestMSE
            },
            matchDetails: fullQRResult.match
        };
        
    } catch (error) {
        console.error("Error:", error.message);
        return {
            isFake: false,
            error: error.message
        };
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node detect_fake_rc_improved.js <path-to-rc-image>');
        console.log('Example: node detect_fake_rc_improved.js New.png');
        process.exit(1);
    }
    
    const targetPath = args[0];
    
    console.log('='.repeat(70));
    console.log('Enhanced Fake RC Detection System');
    console.log('='.repeat(70));
    console.log(`Target Image: ${targetPath}`);
    console.log(`Reference QR: ${REFERENCE_QR_PATH}`);
    console.log('='.repeat(70));
    console.log('');
    
    detectFakeRC(targetPath).then(result => {
        console.log('\n' + '='.repeat(70));
        console.log('DETECTION RESULTS');
        console.log('='.repeat(70));
        
        if (result.error) {
            console.log(`❌ Error: ${result.error}`);
        } else {
            console.log(`Status: ${result.isFake ? '⚠️  FAKE RC DETECTED' : '✅ REAL/UNKNOWN'}`);
            console.log(`Confidence: ${result.confidence.toFixed(2)}%`);
            
            if (result.detectionMethod) {
                console.log(`Detection Method: ${result.detectionMethod}`);
            }
            
            console.log('\nScores (lower is better match):');
            console.log(`  Full QR Match: ${result.scores.fullQR.toFixed(2)} (threshold: ${CONFIG.FULL_QR_THRESHOLD})`);
            console.log(`  Data Region Match: ${result.scores.dataRegion.toFixed(2)} (threshold: ${CONFIG.DATA_REGION_THRESHOLD})`);
            console.log(`  Best Score: ${result.scores.best.toFixed(2)}`);
            
            if (result.matchDetails) {
                console.log('\nMatch Details:');
                console.log(`  Position: (${result.matchDetails.x}, ${result.matchDetails.y})`);
                console.log(`  Size: ${result.matchDetails.width}x${result.matchDetails.height}`);
                console.log(`  Scale: ${result.matchDetails.scale}x`);
                console.log(`  Rotation: ${result.matchDetails.angle}°`);
            }
        }
        
        console.log('='.repeat(70));
        
        // Exit with appropriate code
        process.exit(result.isFake ? 1 : 0);
    });
}

module.exports = { detectFakeRC, matchFullQR, matchDataRegion };
