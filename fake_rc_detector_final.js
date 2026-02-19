/**
 * Fake RC Detection System
 * 
 * This module detects fake Registration Certificates (RCs) by identifying
 * a specific QR code pattern that is known to appear on fake RCs.
 * 
 * Usage:
 *   const { detectFakeRC } = require('./fake_rc_detector_final');
 *   
 *   const result = await detectFakeRC('path/to/rc/image.jpg');
 *   
 *   if (result.isFake) {
 *     console.log('Fake RC detected!');
 *   }
 * 
 * @module fake_rc_detector_final
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Path to the reference fake QR code image
const REFERENCE_QR_PATH = path.join(__dirname, 'fake_rc_qr_ref.png');

/**
 * Configuration for the detection algorithm
 */
const CONFIG = {
    // Detection threshold (MSE score)
    // Lower values = stricter matching
    // Recommended: 500-600 for high confidence
    THRESHOLD: 550,
    
    // Scales to test (handles different image sizes)
    SCALES: [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0],
    
    // Rotation angles to test (in degrees)
    ROTATIONS: [0, 90, 180, 270],
    
    // QR code patch extraction ratios
    // These define which part of the reference QR to extract for matching
    PATCH_WIDTH_RATIO: 0.25,
    PATCH_HEIGHT_RATIO: 0.25,
    PATCH_LEFT_RATIO: 0.4,
    PATCH_TOP_RATIO: 0.6,
    
    // Search optimization parameters
    COARSE_STRIDE_RATIO: 0.1,
    COARSE_PIXEL_STRIDE: 4,
    FINE_PIXEL_STRIDE: 2,
    EARLY_TERM_THRESHOLD: 30000,
    TOP_CANDIDATES: 10
};

/**
 * Detects if an RC image contains the fake QR code pattern
 * 
 * @param {string} imagePath - Path to the RC image to check
 * @param {Object} options - Optional configuration overrides
 * @param {number} options.threshold - Custom detection threshold
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<Object>} Detection result object
 * 
 * @example
 * const result = await detectFakeRC('rc_image.jpg');
 * console.log(result.isFake); // true or false
 * console.log(result.score);  // Match score
 * console.log(result.confidence); // Confidence percentage
 */
async function detectFakeRC(imagePath, options = {}) {
    const threshold = options.threshold || CONFIG.THRESHOLD;
    const verbose = options.verbose || false;
    
    // Validate inputs
    if (!fs.existsSync(REFERENCE_QR_PATH)) {
        throw new Error(`Reference QR code not found at: ${REFERENCE_QR_PATH}`);
    }
    
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found at: ${imagePath}`);
    }
    
    if (verbose) {
        console.log(`[INFO] Loading reference QR from: ${REFERENCE_QR_PATH}`);
        console.log(`[INFO] Analyzing image: ${imagePath}`);
        console.log(`[INFO] Detection threshold: ${threshold}`);
    }
    
    try {
        // Load reference QR code metadata
        const refMeta = await sharp(REFERENCE_QR_PATH).metadata();
        const refWidth = refMeta.width;
        const refHeight = refMeta.height;
        
        // Calculate patch dimensions
        const patchWidth = Math.floor(refWidth * CONFIG.PATCH_WIDTH_RATIO);
        const patchHeight = Math.floor(refHeight * CONFIG.PATCH_HEIGHT_RATIO);
        const patchLeft = Math.floor(refWidth * CONFIG.PATCH_LEFT_RATIO);
        const patchTop = Math.floor(refHeight * CONFIG.PATCH_TOP_RATIO);
        
        if (verbose) {
            console.log(`[INFO] Reference QR size: ${refWidth}x${refHeight}`);
            console.log(`[INFO] Patch size: ${patchWidth}x${patchHeight} at (${patchLeft}, ${patchTop})`);
        }
        
        // Prepare reference patches at different rotations
        const refBuffers = [];
        const baseExtract = sharp(REFERENCE_QR_PATH)
            .extract({ left: patchLeft, top: patchTop, width: patchWidth, height: patchHeight })
            .flatten({ background: '#ffffff' });
        
        for (const angle of CONFIG.ROTATIONS) {
            const pipeline = baseExtract.clone().rotate(angle);
            const rW = (angle % 180 === 0) ? patchWidth : patchHeight;
            const rH = (angle % 180 === 0) ? patchHeight : patchWidth;
            const buffer = await pipeline.grayscale().raw().toBuffer();
            refBuffers.push({ angle, buffer, width: rW, height: rH });
        }
        
        // Load target image
        const targetImage = sharp(imagePath).flatten({ background: '#ffffff' });
        const targetMeta = await targetImage.metadata();
        const targetBuffer = await targetImage.grayscale().raw().toBuffer();
        const targetW = targetMeta.width;
        const targetH = targetMeta.height;
        
        if (verbose) {
            console.log(`[INFO] Target image size: ${targetW}x${targetH}`);
            console.log(`[INFO] Starting multi-scale search...`);
        }
        
        // Multi-scale, multi-rotation search
        let globalBestMSE = Infinity;
        let bestMatch = null;
        
        for (const scale of CONFIG.SCALES) {
            for (const refObj of refBuffers) {
                const scaledW = Math.floor(refObj.width * scale);
                const scaledH = Math.floor(refObj.height * scale);
                
                // Skip if scaled patch is too large or too small
                if (scaledW > targetW || scaledH > targetH || scaledW < 10 || scaledH < 10) {
                    continue;
                }
                
                // Scale reference buffer if needed
                let scaledRefBuffer;
                if (scaledW === refObj.width && scaledH === refObj.height) {
                    scaledRefBuffer = refObj.buffer;
                } else {
                    scaledRefBuffer = await sharp(refObj.buffer, {
                        raw: { width: refObj.width, height: refObj.height, channels: 1 }
                    }).resize(scaledW, scaledH).raw().toBuffer();
                }
                
                // Pre-calculate reference mean
                let meanR = 0;
                for (let py = 0; py < scaledH; py += CONFIG.FINE_PIXEL_STRIDE) {
                    for (let px = 0; px < scaledW; px += CONFIG.FINE_PIXEL_STRIDE) {
                        meanR += scaledRefBuffer[(py * scaledW) + px];
                    }
                }
                meanR /= ((scaledH / CONFIG.FINE_PIXEL_STRIDE) * (scaledW / CONFIG.FINE_PIXEL_STRIDE));
                
                // Coarse search
                const coarseStride = Math.max(4, Math.floor(scaledW * CONFIG.COARSE_STRIDE_RATIO));
                const candidates = [];
                
                for (let y = 0; y <= targetH - scaledH; y += coarseStride) {
                    for (let x = 0; x <= targetW - scaledW; x += coarseStride) {
                        // Calculate target mean
                        let meanT = 0;
                        let countT = 0;
                        
                        for (let py = 0; py < scaledH; py += CONFIG.COARSE_PIXEL_STRIDE) {
                            for (let px = 0; px < scaledW; px += CONFIG.COARSE_PIXEL_STRIDE) {
                                meanT += targetBuffer[((y + py) * targetW) + (x + px)];
                                countT++;
                            }
                        }
                        meanT /= countT;
                        
                        // Calculate Zero-Mean MSE
                        let sumSq = 0;
                        let valid = true;
                        
                        for (let py = 0; py < scaledH; py += CONFIG.COARSE_PIXEL_STRIDE) {
                            for (let px = 0; px < scaledW; px += CONFIG.COARSE_PIXEL_STRIDE) {
                                const valT = targetBuffer[((y + py) * targetW) + (x + px)];
                                const valR = scaledRefBuffer[(py * scaledW) + px];
                                const diff = (valT - meanT) - (valR - meanR);
                                sumSq += diff * diff;
                                
                                // Early termination for bad matches
                                if (sumSq / countT > CONFIG.EARLY_TERM_THRESHOLD) {
                                    valid = false;
                                    break;
                                }
                            }
                            if (!valid) break;
                        }
                        
                        if (valid) {
                            candidates.push({ x, y, mse: sumSq / countT });
                        }
                    }
                }
                
                // Fine search on top candidates
                candidates.sort((a, b) => a.mse - b.mse);
                const topCandidates = candidates.slice(0, CONFIG.TOP_CANDIDATES);
                
                for (const cand of topCandidates) {
                    const radius = coarseStride;
                    const startY = Math.max(0, cand.y - radius);
                    const endY = Math.min(targetH - scaledH, cand.y + radius);
                    const startX = Math.max(0, cand.x - radius);
                    const endX = Math.min(targetW - scaledW, cand.x + radius);
                    
                    for (let y = startY; y <= endY; y++) {
                        for (let x = startX; x <= endX; x++) {
                            // Calculate target mean
                            let meanT = 0;
                            let countT = 0;
                            
                            for (let py = 0; py < scaledH; py += CONFIG.FINE_PIXEL_STRIDE) {
                                for (let px = 0; px < scaledW; px += CONFIG.FINE_PIXEL_STRIDE) {
                                    meanT += targetBuffer[((y + py) * targetW) + (x + px)];
                                    countT++;
                                }
                            }
                            meanT /= countT;
                            
                            // Calculate Zero-Mean MSE
                            let sumSq = 0;
                            let valid = true;
                            
                            for (let py = 0; py < scaledH; py += CONFIG.FINE_PIXEL_STRIDE) {
                                for (let px = 0; px < scaledW; px += CONFIG.FINE_PIXEL_STRIDE) {
                                    const valT = targetBuffer[((y + py) * targetW) + (x + px)];
                                    const valR = scaledRefBuffer[(py * scaledW) + px];
                                    const diff = (valT - meanT) - (valR - meanR);
                                    sumSq += diff * diff;
                                    
                                    // Early termination if worse than current best
                                    if (sumSq / countT > globalBestMSE) {
                                        valid = false;
                                        break;
                                    }
                                }
                                if (!valid) break;
                            }
                            
                            if (valid) {
                                const mse = sumSq / countT;
                                if (mse < globalBestMSE) {
                                    globalBestMSE = mse;
                                    bestMatch = {
                                        x, y,
                                        scale,
                                        angle: refObj.angle,
                                        width: scaledW,
                                        height: scaledH
                                    };
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Calculate results
        const isFake = globalBestMSE < threshold;
        const confidence = isFake 
            ? Math.max(0, Math.min(100, 100 - (globalBestMSE / threshold) * 100))
            : 0;
        
        if (verbose) {
            console.log(`[INFO] Best match score: ${globalBestMSE.toFixed(2)}`);
            console.log(`[INFO] Threshold: ${threshold}`);
            console.log(`[INFO] Result: ${isFake ? 'FAKE' : 'REAL/UNKNOWN'}`);
        }
        
        return {
            isFake,
            score: Math.round(globalBestMSE * 100) / 100,
            threshold,
            confidence: Math.round(confidence * 100) / 100,
            match: bestMatch,
            imageInfo: {
                width: targetW,
                height: targetH,
                filename: path.basename(imagePath)
            }
        };
        
    } catch (error) {
        throw new Error(`Detection failed: ${error.message}`);
    }
}

/**
 * Flags an RC as fake (placeholder for your actual flagging logic)
 */
function flagAsFake(imagePath, result) {
    console.log(`⚠️  FLAGGING AS FAKE: ${imagePath}`);
    console.log(`   Score: ${result.score}`);
    console.log(`   Confidence: ${result.confidence}%`);
    // Add your actual flagging logic here
    // e.g., update database, move file, send notification, etc.
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('━'.repeat(70));
        console.log('Fake RC Detection System');
        console.log('━'.repeat(70));
        console.log('');
        console.log('Usage:');
        console.log('  node fake_rc_detector_final.js <image-path> [options]');
        console.log('');
        console.log('Options:');
        console.log('  --threshold <number>  Custom detection threshold (default: 550)');
        console.log('  --verbose             Enable verbose logging');
        console.log('');
        console.log('Examples:');
        console.log('  node fake_rc_detector_final.js uploaded_rc.jpg');
        console.log('  node fake_rc_detector_final.js rc.jpg --threshold 600');
        console.log('  node fake_rc_detector_final.js rc.jpg --verbose');
        console.log('');
        console.log('Exit codes:');
        console.log('  0 - Real/Unknown RC (no fake pattern detected)');
        console.log('  1 - Fake RC detected');
        console.log('  2 - Error occurred');
        console.log('');
        process.exit(0);
    }
    
    const imagePath = args[0];
    const thresholdIndex = args.indexOf('--threshold');
    const threshold = thresholdIndex !== -1 && args[thresholdIndex + 1] 
        ? parseInt(args[thresholdIndex + 1]) 
        : CONFIG.THRESHOLD;
    const verbose = args.includes('--verbose');
    
    console.log('━'.repeat(70));
    console.log('🔍 Fake RC Detection System');
    console.log('━'.repeat(70));
    console.log(`📄 Image: ${path.basename(imagePath)}`);
    console.log(`🎯 Threshold: ${threshold}`);
    console.log('━'.repeat(70));
    console.log('');
    
    detectFakeRC(imagePath, { threshold, verbose })
        .then(result => {
            console.log('━'.repeat(70));
            console.log('📊 RESULTS');
            console.log('━'.repeat(70));
            console.log('');
            console.log(`Status: ${result.isFake ? '⚠️  FAKE RC DETECTED' : '✅ REAL/UNKNOWN'}`);
            console.log(`Score: ${result.score} (threshold: ${result.threshold})`);
            console.log(`Confidence: ${result.confidence}%`);
            console.log('');
            
            if (result.match) {
                console.log('Match Details:');
                console.log(`  Position: (${result.match.x}, ${result.match.y})`);
                console.log(`  Size: ${result.match.width}x${result.match.height} pixels`);
                console.log(`  Scale: ${result.match.scale}x`);
                console.log(`  Rotation: ${result.match.angle}°`);
                console.log('');
            }
            
            if (result.isFake) {
                console.log('⚠️  WARNING: This RC contains a QR code pattern matching the');
                console.log('   known fake QR reference. Please review manually.');
            } else {
                console.log('✅ This RC does not match the known fake QR pattern.');
            }
            
            console.log('');
            console.log('━'.repeat(70));
            
            // Exit with appropriate code
            process.exit(result.isFake ? 1 : 0);
        })
        .catch(error => {
            console.error('');
            console.error('❌ ERROR:', error.message);
            console.error('━'.repeat(70));
            process.exit(2);
        });
}

module.exports = {
    detectFakeRC,
    flagAsFake,
    CONFIG
};
