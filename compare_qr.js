const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Compare two images to see if they contain similar QR codes
 */
async function compareQRCodes(image1Path, image2Path) {
    try {
        const img1 = await sharp(image1Path).flatten({ background: '#ffffff' }).grayscale();
        const img2 = await sharp(image2Path).flatten({ background: '#ffffff' }).grayscale();
        
        const meta1 = await img1.metadata();
        const meta2 = await img2.metadata();
        
        console.log(`Image 1: ${meta1.width}x${meta1.height}`);
        console.log(`Image 2: ${meta2.width}x${meta2.height}`);
        
        // Extract QR code regions from both images (assuming they're in similar positions)
        // For New.png, the QR is around (570, 533) at scale 0.2
        // For realog1.jpeg, the QR is around (408, 1304) at scale 0.2
        
        // Let's extract the QR regions and compare them
        const qr1 = await extractQRRegion(image1Path);
        const qr2 = await extractQRRegion(image2Path);
        
        if (!qr1 || !qr2) {
            console.log('Could not extract QR regions from both images');
            return;
        }
        
        // Compare the two QR codes
        const similarity = await compareBuffers(qr1.buffer, qr1.width, qr1.height, qr2.buffer, qr2.width, qr2.height);
        
        console.log(`\nQR Code Similarity: ${similarity.toFixed(2)}%`);
        
        if (similarity > 80) {
            console.log('✅ The QR codes appear to be VERY SIMILAR or IDENTICAL');
        } else if (similarity > 60) {
            console.log('⚠️  The QR codes appear to be SIMILAR');
        } else {
            console.log('❌ The QR codes appear to be DIFFERENT');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function extractQRRegion(imagePath) {
    try {
        const img = await sharp(imagePath).flatten({ background: '#ffffff' }).grayscale();
        const meta = await img.metadata();
        
        // Look for QR code in the upper portion of the image
        // Virtual RCs typically have the QR code in the top section
        const searchHeight = Math.min(meta.height, Math.floor(meta.height * 0.4));
        const searchRegion = await sharp(imagePath)
            .extract({ left: 0, top: 0, width: meta.width, height: searchHeight })
            .flatten({ background: '#ffffff' })
            .grayscale()
            .raw()
            .toBuffer();
        
        // Find the darkest square region (likely the QR code)
        // QR codes have high contrast
        let minAvg = 255;
        let bestRegion = null;
        
        const qrSize = Math.floor(Math.min(meta.width, searchHeight) * 0.3);
        const stride = Math.floor(qrSize * 0.1);
        
        for (let y = 0; y < searchHeight - qrSize; y += stride) {
            for (let x = 0; x < meta.width - qrSize; x += stride) {
                let sum = 0;
                let count = 0;
                
                for (let py = 0; py < qrSize; py += 4) {
                    for (let px = 0; px < qrSize; px += 4) {
                        sum += searchRegion[((y + py) * meta.width) + (x + px)];
                        count++;
                    }
                }
                
                const avg = sum / count;
                
                // Look for regions with moderate brightness (QR codes are black and white mix)
                if (avg > 80 && avg < 180 && avg < minAvg) {
                    minAvg = avg;
                    bestRegion = { x, y, size: qrSize };
                }
            }
        }
        
        if (!bestRegion) {
            return null;
        }
        
        console.log(`Found QR region at (${bestRegion.x}, ${bestRegion.y}), size: ${bestRegion.size}x${bestRegion.size}`);
        
        const qrBuffer = await sharp(imagePath)
            .extract({ left: bestRegion.x, top: bestRegion.y, width: bestRegion.size, height: bestRegion.size })
            .flatten({ background: '#ffffff' })
            .grayscale()
            .resize(200, 200) // Normalize size for comparison
            .raw()
            .toBuffer();
        
        return { buffer: qrBuffer, width: 200, height: 200 };
        
    } catch (error) {
        console.error('Error extracting QR region:', error.message);
        return null;
    }
}

async function compareBuffers(buf1, w1, h1, buf2, w2, h2) {
    if (w1 !== w2 || h1 !== h2) {
        throw new Error('Buffers must be same size');
    }
    
    // Calculate normalized cross-correlation
    let mean1 = 0, mean2 = 0;
    const size = w1 * h1;
    
    for (let i = 0; i < size; i++) {
        mean1 += buf1[i];
        mean2 += buf2[i];
    }
    mean1 /= size;
    mean2 /= size;
    
    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;
    
    for (let i = 0; i < size; i++) {
        const diff1 = buf1[i] - mean1;
        const diff2 = buf2[i] - mean2;
        numerator += diff1 * diff2;
        denom1 += diff1 * diff1;
        denom2 += diff2 * diff2;
    }
    
    const correlation = numerator / Math.sqrt(denom1 * denom2);
    return correlation * 100; // Convert to percentage
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: node compare_qr.js <image1> <image2>');
        console.log('Example: node compare_qr.js New.png realog1.jpeg');
        process.exit(1);
    }
    
    console.log('━'.repeat(60));
    console.log('🔍 QR Code Comparison');
    console.log('━'.repeat(60));
    console.log(`Image 1: ${path.basename(args[0])}`);
    console.log(`Image 2: ${path.basename(args[1])}`);
    console.log('━'.repeat(60));
    console.log('');
    
    compareQRCodes(args[0], args[1]);
}

module.exports = { compareQRCodes };
