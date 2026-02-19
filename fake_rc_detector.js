const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REFERENCE_QR_PATH = path.join(__dirname, 'fake_rc_qr_ref.png');

/**
 * Comprehensive Fake RC Detection System
 * 
 * This system detects fake RCs by matching against a known fake QR code pattern.
 * It uses Zero-Mean Mean Squared Error (ZM-MSE) with multi-scale and multi-rotation matching.
 */

const DEFAULT_CONFIG = {
    // Detection threshold - lower values mean stricter matching
    // Recommended: 800-1200 for high confidence detection
    threshold: 1000,
    
    // Scales to test (handles different image sizes)
    scales: [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0],
    
    // Rotation angles to test
    rotations: [0, 90, 180, 270],
    
    // Patch extraction parameters (what part of the QR to match)
    // These extract a distinctive region from the QR code
    patchWidthRatio: 0.25,   // 25% of QR width
    patchHeightRatio: 0.25,  // 25% of QR height
    patchLeftRatio: 0.4,     // Start at 40% from left
    patchTopRatio: 0.6,      // Start at 60% from top
    
    // Search parameters
    coarseStrideRatio: 0.1,  // Coarse search step size
    fineSearchRadius: 1.0,   // Fine search radius multiplier
    
    // Performance parameters
    coarsePixelStride: 4,    // Sample every 4th pixel in coarse search
    finePixelStride: 2,      // Sample every 2nd pixel in fine search
    earlyTermThreshold: 30000, // Early termination for bad matches
    topCandidates: 10        // Number of candidates to refine
};

/**
 * Main detection function
 */
async function detectFakeRC(targetPath, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    
    // Validate inputs
    if (!fs.existsSync(REFERENCE_QR_PATH)) {
        throw new Error(`Reference QR code not found at: ${REFERENCE_QR_PATH}`);
    }
    
    if (!fs.existsSync(targetPath)) {
        throw new Error(`Target image not found at: ${targetPath}`);
    }
    
    try {
        // Load and prepare reference QR code
        const refMeta = await sharp(REFERENCE_QR_PATH).metadata();
        const refWidth = refMeta.width;
        const refHeight = refMeta.height;
        
        // Extract distinctive patch from reference QR
        const patchWidth = Math.floor(refWidth * cfg.patchWidthRatio);
        const patchHeight = Math.floor(refHeight * cfg.patchHeightRatio);
        const patchLeft = Math.floor(refWidth * cfg.patchLeftRatio);
        const patchTop = Math.floor(refHeight * cfg.patchTopRatio);
        
        // Prepare reference patches at different rotations
        const refBuffers = [];
        const baseExtract = sharp(REFERENCE_QR_PATH)
            .extract({ left: patchLeft, top: patchTop, width: patchWidth, height: patchHeight })
            .flatten({ background: '#ffffff' });
        
        for (const angle of cfg.rotations) {
            const pipeline = baseExtract.clone().rotate(angle);
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
        
        // Search for matches
        let globalBestMSE = Infinity;
        let bestMatch = null;
        let searchStats = {
            scalesSearched: 0,
            rotationsSearched: 0,
            coarsePositions: 0,
            finePositions: 0
        };
        
        for (const scale of cfg.scales) {
            for (const refObj of refBuffers) {
                const scaledW = Math.floor(refObj.width * scale);
                const scaledH = Math.floor(refObj.height * scale);
                
                if (scaledW > targetW || scaledH > targetH || scaledW < 10 || scaledH < 10) {
                    continue;
                }
                
                searchStats.scalesSearched++;
                searchStats.rotationsSearched++;
                
                // Scale reference if needed
                let scaledRefBuffer;
                if (scaledW === refObj.width && scaledH === refObj.height) {
                    scaledRefBuffer = refObj.buffer;
                } else {
                    scaledRefBuffer = await sharp(refObj.buffer, {
                        raw: { width: refObj.width, height: refObj.height, channels: 1 }
                    }).resize(scaledW, scaledH).raw().toBuffer();
                }
                
                // Pre-calculate reference mean for fine search
                let meanR = 0;
                for (let py = 0; py < scaledH; py += cfg.finePixelStride) {
                    for (let px = 0; px < scaledW; px += cfg.finePixelStride) {
                        meanR += scaledRefBuffer[(py * scaledW) + px];
                    }
                }
                meanR /= ((scaledH / cfg.finePixelStride) * (scaledW / cfg.finePixelStride));
                
                // Coarse search
                const coarseStride = Math.max(4, Math.floor(scaledW * cfg.coarseStrideRatio));
                const candidates = [];
                
                for (let y = 0; y <= targetH - scaledH; y += coarseStride) {
                    for (let x = 0; x <= targetW - scaledW; x += coarseStride) {
                        searchStats.coarsePositions++;
                        
                        // Quick coarse evaluation
                        let meanT = 0;
                        let countT = 0;
                        
                        for (let py = 0; py < scaledH; py += cfg.coarsePixelStride) {
                            for (let px = 0; px < scaledW; px += cfg.coarsePixelStride) {
                                meanT += targetBuffer[((y + py) * targetW) + (x + px)];
                                countT++;
                            }
                        }
                        meanT /= countT;
                        
                        let sumSq = 0;
                        let valid = true;
                        
                        for (let py = 0; py < scaledH; py += cfg.coarsePixelStride) {
                            for (let px = 0; px < scaledW; px += cfg.coarsePixelStride) {
                                const valT = targetBuffer[((y + py) * targetW) + (x + px)];
                                const valR = scaledRefBuffer[(py * scaledW) + px];
                                const diff = (valT - meanT) - (valR - meanR);
                                sumSq += diff * diff;
                                
                                if (sumSq / countT > cfg.earlyTermThreshold) {
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
                const topCandidates = candidates.slice(0, cfg.topCandidates);
                
                for (const cand of topCandidates) {
                    const radius = Math.floor(coarseStride * cfg.fineSearchRadius);
                    const startY = Math.max(0, cand.y - radius);
                    const endY = Math.min(targetH - scaledH, cand.y + radius);
                    const startX = Math.max(0, cand.x - radius);
                    const endX = Math.min(targetW - scaledW, cand.x + radius);
                    
                    for (let y = startY; y <= endY; y++) {
                        for (let x = startX; x <= endX; x++) {
                            searchStats.finePositions++;
                            
                            // Fine evaluation
                            let meanT = 0;
                            let countT = 0;
                            
                            for (let py = 0; py < scaledH; py += cfg.finePixelStride) {
                                for (let px = 0; px < scaledW; px += cfg.finePixelStride) {
                                    meanT += targetBuffer[((y + py) * targetW) + (x + px)];
                                    countT++;
                                }
                            }
                            meanT /= countT;
                            
                            let sumSq = 0;
                            let valid = true;
                            
                            for (let py = 0; py < scaledH; py += cfg.finePixelStride) {
                                for (let px = 0; px < scaledW; px += cfg.finePixelStride) {
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
        const isFake = globalBestMSE < cfg.threshold;
        const confidence = isFake 
            ? Math.max(0, Math.min(100, 100 - (globalBestMSE / cfg.threshold) * 100))
            : 0;
        
        return {
            isFake,
            score: Math.round(globalBestMSE * 100) / 100,
            threshold: cfg.threshold,
            confidence: Math.round(confidence * 100) / 100,
            match: bestMatch,
            imageInfo: {
                width: targetW,
                height: targetH,
                path: targetPath
            },
            searchStats
        };
        
    } catch (error) {
        throw new Error(`Detection failed: ${error.message}`);
    }
}

/**
 * Batch detection for multiple images
 */
async function detectFakeRCBatch(imagePaths, config = {}) {
    const results = [];
    
    for (const imagePath of imagePaths) {
        try {
            const result = await detectFakeRC(imagePath, config);
            results.push({
                ...result,
                filename: path.basename(imagePath)
            });
        } catch (error) {
            results.push({
                filename: path.basename(imagePath),
                error: error.message,
                isFake: false
            });
        }
    }
    
    return results;
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node fake_rc_detector.js <image-path> [threshold] [--verbose]');
        console.log('');
        console.log('Examples:');
        console.log('  node fake_rc_detector.js New.png');
        console.log('  node fake_rc_detector.js realog1.jpeg 1000');
        console.log('  node fake_rc_detector.js New.png 1200 --verbose');
        console.log('');
        console.log('Default threshold: 1000 (lower = stricter detection)');
        console.log('Recommended range: 800-1200');
        process.exit(1);
    }
    
    const targetPath = args[0];
    const threshold = args[1] && !args[1].startsWith('--') ? parseInt(args[1]) : 1000;
    const verbose = args.includes('--verbose');
    
    console.log('━'.repeat(70));
    console.log('🔍 Fake RC Detection System');
    console.log('━'.repeat(70));
    console.log(`📄 Target: ${path.basename(targetPath)}`);
    console.log(`🎯 Threshold: ${threshold}`);
    console.log(`📊 Mode: ${verbose ? 'Verbose' : 'Standard'}`);
    console.log('━'.repeat(70));
    console.log('');
    console.log('⏳ Analyzing image...');
    console.log('');
    
    detectFakeRC(targetPath, { threshold })
        .then(result => {
            console.log('━'.repeat(70));
            console.log('📊 DETECTION RESULTS');
            console.log('━'.repeat(70));
            console.log('');
            console.log(`Status: ${result.isFake ? '⚠️  FAKE RC DETECTED' : '✅ APPEARS TO BE REAL/UNKNOWN'}`);
            console.log(`Match Score: ${result.score} (threshold: ${result.threshold})`);
            console.log(`Confidence: ${result.confidence}%`);
            console.log('');
            
            if (result.match) {
                console.log('Match Details:');
                console.log(`  📍 Position: (${result.match.x}, ${result.match.y})`);
                console.log(`  📏 Size: ${result.match.width}x${result.match.height} pixels`);
                console.log(`  🔍 Scale: ${result.match.scale}x`);
                console.log(`  🔄 Rotation: ${result.match.angle}°`);
                console.log('');
            }
            
            if (verbose) {
                console.log('Image Information:');
                console.log(`  Dimensions: ${result.imageInfo.width}x${result.imageInfo.height}`);
                console.log('');
                console.log('Search Statistics:');
                console.log(`  Scales tested: ${result.searchStats.scalesSearched}`);
                console.log(`  Coarse positions: ${result.searchStats.coarsePositions}`);
                console.log(`  Fine positions: ${result.searchStats.finePositions}`);
                console.log('');
            }
            
            console.log('Interpretation:');
            if (result.isFake) {
                console.log(`  ⚠️  This RC contains a QR code pattern that matches the known`);
                console.log(`     fake QR reference. Score of ${result.score} is below threshold`);
                console.log(`     of ${result.threshold}, indicating a ${result.confidence}% confidence match.`);
            } else {
                console.log(`  ✅ This RC does not match the known fake QR pattern.`);
                console.log(`     Score of ${result.score} is above threshold of ${result.threshold}.`);
            }
            
            console.log('');
            console.log('━'.repeat(70));
            
            process.exit(result.isFake ? 1 : 0);
        })
        .catch(error => {
            console.error('');
            console.error('❌ Error:', error.message);
            console.error('━'.repeat(70));
            process.exit(2);
        });
}

module.exports = { detectFakeRC, detectFakeRCBatch, DEFAULT_CONFIG };
