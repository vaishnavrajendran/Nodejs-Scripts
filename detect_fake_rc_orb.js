const cv = require('opencv4nodejs');
const path = require('path');
const fs = require('fs');

// Configuration
const REFERENCE_QR_PATH = path.join(__dirname, 'fake_rc_qr_ref.png');
const MATCH_THRESHOLD = 30; // Minimum number of good matches to flag as fake

/**
 * Detects if an RC image contains the fake QR code pattern using ORB feature matching
 * @param {string} targetImagePath - Path to the RC image to check
 * @returns {Promise<{isFake: boolean, matchCount: number, confidence: number}>}
 */
async function detectFakeRC(targetImagePath) {
    try {
        // Validate inputs
        if (!fs.existsSync(REFERENCE_QR_PATH)) {
            throw new Error(`Reference QR code not found at: ${REFERENCE_QR_PATH}`);
        }
        if (!fs.existsSync(targetImagePath)) {
            throw new Error(`Target image not found at: ${targetImagePath}`);
        }

        // Load images in grayscale
        const fakeQR = cv.imread(REFERENCE_QR_PATH, cv.IMREAD_GRAYSCALE);
        const rcImage = cv.imread(targetImagePath, cv.IMREAD_GRAYSCALE);

        // Initialize ORB detector with optimized parameters
        const orb = new cv.ORBDetector({
            nfeatures: 2000,        // Maximum number of features to retain
            scaleFactor: 1.2,       // Pyramid decimation ratio
            nlevels: 8,             // Number of pyramid levels
            edgeThreshold: 31,      // Size of border where features are not detected
            firstLevel: 0,          // Level of pyramid to put source image to
            WTA_K: 2,               // Number of points that produce each element of the oriented BRIEF descriptor
            patchSize: 31           // Size of the patch used by the oriented BRIEF descriptor
        });

        // Detect keypoints and compute descriptors
        console.log('Detecting features in reference QR code...');
        const fakeResult = orb.detectAndCompute(fakeQR);
        const fakeKeypoints = fakeResult.keypoints;
        const fakeDescriptors = fakeResult.descriptors;

        console.log('Detecting features in target RC image...');
        const rcResult = orb.detectAndCompute(rcImage);
        const rcKeypoints = rcResult.keypoints;
        const rcDescriptors = rcResult.descriptors;

        console.log(`Found ${fakeKeypoints.length} features in reference QR`);
        console.log(`Found ${rcKeypoints.length} features in target RC`);

        // Check if we have enough features
        if (fakeKeypoints.length === 0 || rcKeypoints.length === 0) {
            console.log('Insufficient features detected');
            return {
                isFake: false,
                matchCount: 0,
                confidence: 0,
                message: 'Insufficient features detected for matching'
            };
        }

        // Create BFMatcher (Brute Force Matcher) with Hamming distance
        const matcher = new cv.BFMatcher(cv.NORM_HAMMING);
        
        // Match descriptors using KNN (K-Nearest Neighbors) with k=2
        console.log('Matching features...');
        const knnMatches = matcher.knnMatch(fakeDescriptors, rcDescriptors, 2);

        // Apply Lowe's ratio test to filter good matches
        const LOWE_RATIO = 0.75; // Lower ratio means stricter matching
        const goodMatches = [];
        
        for (const [m, n] of knnMatches) {
            if (m && n && m.distance < LOWE_RATIO * n.distance) {
                goodMatches.push(m);
            }
        }

        console.log(`Found ${goodMatches.length} good matches (threshold: ${MATCH_THRESHOLD})`);

        // Calculate confidence score (0-100)
        const maxPossibleMatches = Math.min(fakeKeypoints.length, rcKeypoints.length);
        const confidence = Math.min(100, (goodMatches.length / maxPossibleMatches) * 100);

        // Determine if it's a fake RC
        const isFake = goodMatches.length >= MATCH_THRESHOLD;

        return {
            isFake,
            matchCount: goodMatches.length,
            confidence: Math.round(confidence * 100) / 100,
            message: isFake 
                ? `FAKE RC DETECTED - Found ${goodMatches.length} matching features` 
                : `Appears to be REAL/UNKNOWN - Only ${goodMatches.length} matching features`
        };

    } catch (error) {
        console.error('Error during fake RC detection:', error.message);
        return {
            isFake: false,
            matchCount: 0,
            confidence: 0,
            error: error.message
        };
    }
}

/**
 * Enhanced detection with multi-scale analysis
 * @param {string} targetImagePath - Path to the RC image to check
 * @returns {Promise<Object>}
 */
async function detectFakeRCEnhanced(targetImagePath) {
    try {
        if (!fs.existsSync(REFERENCE_QR_PATH)) {
            throw new Error(`Reference QR code not found at: ${REFERENCE_QR_PATH}`);
        }
        if (!fs.existsSync(targetImagePath)) {
            throw new Error(`Target image not found at: ${targetImagePath}`);
        }

        const fakeQR = cv.imread(REFERENCE_QR_PATH, cv.IMREAD_GRAYSCALE);
        const rcImage = cv.imread(targetImagePath, cv.IMREAD_GRAYSCALE);

        // Try multiple scales to handle different image sizes
        const scales = [1.0, 0.75, 0.5, 1.25];
        let bestResult = { isFake: false, matchCount: 0, confidence: 0 };

        for (const scale of scales) {
            const scaledRC = rcImage.resize(
                Math.round(rcImage.rows * scale),
                Math.round(rcImage.cols * scale)
            );

            const orb = new cv.ORBDetector({ nfeatures: 2000 });
            
            const fakeResult = orb.detectAndCompute(fakeQR);
            const rcResult = orb.detectAndCompute(scaledRC);

            if (fakeResult.keypoints.length === 0 || rcResult.keypoints.length === 0) {
                continue;
            }

            const matcher = new cv.BFMatcher(cv.NORM_HAMMING);
            const knnMatches = matcher.knnMatch(fakeResult.descriptors, rcResult.descriptors, 2);

            const goodMatches = [];
            for (const [m, n] of knnMatches) {
                if (m && n && m.distance < 0.75 * n.distance) {
                    goodMatches.push(m);
                }
            }

            const maxPossible = Math.min(fakeResult.keypoints.length, rcResult.keypoints.length);
            const confidence = Math.min(100, (goodMatches.length / maxPossible) * 100);

            if (goodMatches.length > bestResult.matchCount) {
                bestResult = {
                    isFake: goodMatches.length >= MATCH_THRESHOLD,
                    matchCount: goodMatches.length,
                    confidence: Math.round(confidence * 100) / 100,
                    scale: scale
                };
            }
        }

        bestResult.message = bestResult.isFake
            ? `FAKE RC DETECTED - Found ${bestResult.matchCount} matching features at scale ${bestResult.scale}`
            : `Appears to be REAL/UNKNOWN - Only ${bestResult.matchCount} matching features`;

        return bestResult;

    } catch (error) {
        console.error('Error during enhanced fake RC detection:', error.message);
        return {
            isFake: false,
            matchCount: 0,
            confidence: 0,
            error: error.message
        };
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node detect_fake_rc_orb.js <path-to-rc-image> [--enhanced]');
        console.log('Example: node detect_fake_rc_orb.js uploaded_rc.jpg');
        console.log('Example: node detect_fake_rc_orb.js uploaded_rc.jpg --enhanced');
        process.exit(1);
    }

    const targetPath = args[0];
    const useEnhanced = args.includes('--enhanced');

    console.log('='.repeat(60));
    console.log('Fake RC Detection System (ORB Feature Matching)');
    console.log('='.repeat(60));
    console.log(`Target Image: ${targetPath}`);
    console.log(`Reference QR: ${REFERENCE_QR_PATH}`);
    console.log(`Mode: ${useEnhanced ? 'Enhanced (Multi-scale)' : 'Standard'}`);
    console.log('='.repeat(60));

    const detectFunction = useEnhanced ? detectFakeRCEnhanced : detectFakeRC;
    
    detectFunction(targetPath).then(result => {
        console.log('\nRESULTS:');
        console.log('-'.repeat(60));
        console.log(`Status: ${result.isFake ? '⚠️  FAKE RC DETECTED' : '✅ REAL/UNKNOWN'}`);
        console.log(`Match Count: ${result.matchCount}`);
        console.log(`Confidence: ${result.confidence}%`);
        if (result.scale) {
            console.log(`Best Scale: ${result.scale}x`);
        }
        console.log(`Message: ${result.message}`);
        if (result.error) {
            console.log(`Error: ${result.error}`);
        }
        console.log('='.repeat(60));

        // Exit with appropriate code
        process.exit(result.isFake ? 1 : 0);
    });
}

module.exports = { detectFakeRC, detectFakeRCEnhanced };
