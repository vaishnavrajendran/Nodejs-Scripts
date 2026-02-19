const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REFERENCE_QR_PATH = path.join(__dirname, 'fake_rc_qr_ref.png');

/**
 * Simple and fast fake RC detection
 * Uses a focused data region approach to avoid false positives
 */
async function detectFakeRC(targetPath, options = {}) {
    const {
        // Lower threshold = stricter matching (fewer false positives)
        // Higher threshold = looser matching (more detections)
        threshold = 1200,
        verbose = false
    } = options;
    
    if (!fs.existsSync(REFERENCE_QR_PATH)) {
        throw new Error("Reference QR code image not found");
    }
    
    if (!fs.existsSync(targetPath)) {
        throw new Error("Target image not found");
    }
    
    try {
        // Load reference QR and extract a distinctive data region
        const refMeta = await sharp(REFERENCE_QR_PATH).metadata();
        const refWidth = refMeta.width;
        const refHeight = refMeta.height;
        
        // Extract a patch from the QR data region (avoiding center logo and corners)
        // This region should be unique to the fake QR code
        const patchWidth = Math.floor(refWidth * 0.25);
        const patchHeight = Math.floor(refHeight * 0.25);
        const patchLeft = Math.floor(refWidth * 0.4);
        const patchTop = Math.floor(refHeight * 0.6);
        
        if (verbose) {
            console.log(`Reference QR: ${refWidth}x${refHeight}`);
            console.log(`Patch region: ${patchWidth}x${patchHeight} at (${patchLeft}, ${patchTop})`);
        }
        
        // Prepare reference patches at different rotations
        const refBuffers = [];
        const baseExtract = sharp(REFERENCE_QR_PATH)
            .extract({ left: patchLeft, top: patchTop, width: patchWidth, height: patchHeight })
            .flatten({ background: '#ffffff' });
        
        for (const angle of [0, 90, 180, 270]) {
            let pipeline = baseExtract.clone().rotate(angle);
            const rW = (angle % 180 === 0) ? patchWidth : patchHeight;
            const rH = (angle % 180 === 0) ? patchHeight : patchWidth;
            const buffer = await pipeline.grayscale().raw().toBuffer();
            refBuffers.push({ angle, buffer, width: rW, height: rH });
        }
        
        // Load target image
        const targetImage = sharp(targetPath).flatten({ background: '#ffffff' });
        const targetMeta = await targetImage.metadata();
        const targetBuffer = await targetImage.grayscale().raw().toBuffer();
        const targetW = targetMeta.width;
        const targetH = targetMeta.height;
        
        if (verbose) {
            console.log(`Target image: ${targetW}x${targetH}`);
        }
        
        // Test multiple scales
        const scales = [0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2];
        let globalBestMSE = Infinity;
        let bestMatch = null;
        
        for (const scale of scales) {
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
                
                // Pre-calculate reference mean (for fine search)
                let meanR = 0;
                let countR = 0;
                for (let py = 0; py < scaledH; py += 2) {
                    for (let px = 0; px < scaledW; px += 2) {
                        meanR += scaledRefBuffer[(py * scaledW) + px];
                        countR++;
                    }
                }
                meanR /= (countR || 1);
                
                // Coarse search with larger stride
                const coarseStride = Math.max(4, Math.floor(scaledW * 0.1));
                const candidates = [];
                
                for (let y = 0; y <= targetH - scaledH; y += coarseStride) {
                    for (let x = 0; x <= targetW - scaledW; x += coarseStride) {
                        // Quick coarse evaluation
                        let meanT = 0;
                        let countT = 0;
                        
                        for (let py = 0; py < scaledH; py += 4) {
                            for (let px = 0; px < scaledW; px += 4) {
                                meanT += targetBuffer[((y + py) * targetW) + (x + px)];
                                countT++;
                            }
                        }
                        meanT /= (countT || 1);
                        
                        let sumSq = 0;
                        let valid = true;
                        
                        for (let py = 0; py < scaledH; py += 4) {
                            for (let px = 0; px < scaledW; px += 4) {
                                const valT = targetBuffer[((y + py) * targetW) + (x + px)];
                                const valR = scaledRefBuffer[(py * scaledW) + px];
                                const diff = (valT - meanT) - (valR - meanR);
                                sumSq += diff * diff;
                                
                                // Early termination
                                if (sumSq / countT > 30000) {
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
                const topCandidates = candidates.slice(0, 10);
                
                for (const cand of topCandidates) {
                    const radius = coarseStride;
                    const startY = Math.max(0, cand.y - radius);
                    const endY = Math.min(targetH - scaledH, cand.y + radius);
                    const startX = Math.max(0, cand.x - radius);
                    const endX = Math.min(targetW - scaledW, cand.x + radius);
                    
                    for (let y = startY; y <= endY; y++) {
                        for (let x = startX; x <= endX; x++) {
                            // Fine evaluation with stride 2
                            let meanT = 0;
                            let countT = 0;
                            
                            for (let py = 0; py < scaledH; py += 2) {
                                for (let px = 0; px < scaledW; px += 2) {
                                    meanT += targetBuffer[((y + py) * targetW) + (x + px)];
                                    countT++;
                                }
                            }
                            meanT /= (countT || 1);
                            
                            let sumSq = 0;
                            let valid = true;
                            
                            for (let py = 0; py < scaledH; py += 2) {
                                for (let px = 0; px < scaledW; px += 2) {
                                    const valT = targetBuffer[((y + py) * targetW) + (x + px)];
                                    const valR = scaledRefBuffer[(py * scaledW) + px];
                                    const diff = (valT - meanT) - (valR - meanR);
                                    sumSq += diff * diff;
                                    
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
                                    bestMatch = { x, y, scale, angle: refObj.angle };
                                }
                            }
                        }
                    }
                }
            }
        }
        
        const isFake = globalBestMSE < threshold;
        const confidence = isFake ? Math.max(0, 100 - (globalBestMSE / threshold) * 100) : 0;
        
        return {
            isFake,
            score: Math.round(globalBestMSE * 100) / 100,
            threshold,
            confidence: Math.round(confidence * 100) / 100,
            match: bestMatch
        };
        
    } catch (error) {
        throw new Error(`Detection failed: ${error.message}`);
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node detect_fake_rc_simple.js <image-path> [threshold]');
        console.log('');
        console.log('Examples:');
        console.log('  node detect_fake_rc_simple.js New.png');
        console.log('  node detect_fake_rc_simple.js realog1.jpeg 1200');
        console.log('');
        console.log('Default threshold: 1200 (lower = stricter)');
        process.exit(1);
    }
    
    const targetPath = args[0];
    const threshold = args[1] ? parseInt(args[1]) : 1200;
    
    console.log('━'.repeat(60));
    console.log('🔍 Fake RC Detection');
    console.log('━'.repeat(60));
    console.log(`📄 Target: ${path.basename(targetPath)}`);
    console.log(`🎯 Threshold: ${threshold}`);
    console.log('━'.repeat(60));
    console.log('');
    
    detectFakeRC(targetPath, { threshold, verbose: true })
        .then(result => {
            console.log('');
            console.log('━'.repeat(60));
            console.log('📊 RESULTS');
            console.log('━'.repeat(60));
            console.log(`Status: ${result.isFake ? '⚠️  FAKE RC DETECTED' : '✅ REAL/UNKNOWN'}`);
            console.log(`Score: ${result.score} (threshold: ${result.threshold})`);
            console.log(`Confidence: ${result.confidence}%`);
            
            if (result.match) {
                console.log('');
                console.log('Match Details:');
                console.log(`  Position: (${result.match.x}, ${result.match.y})`);
                console.log(`  Scale: ${result.match.scale}x`);
                console.log(`  Rotation: ${result.match.angle}°`);
            }
            
            console.log('━'.repeat(60));
            
            process.exit(result.isFake ? 1 : 0);
        })
        .catch(error => {
            console.error('');
            console.error('❌ Error:', error.message);
            console.error('━'.repeat(60));
            process.exit(2);
        });
}

module.exports = { detectFakeRC };
