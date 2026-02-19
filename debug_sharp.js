const sharp = require('sharp');
const path = require('path');

async function debugSelf() {
    const refPath = path.join(__dirname, 'fake_rc_qr_ref.png');
    const fullImg = sharp(refPath);
    const meta = await fullImg.metadata();
    
    const w = Math.floor(meta.width * 0.5);
    const h = Math.floor(meta.height * 0.5);
    const l = Math.floor((meta.width - w) / 2);
    const t = Math.floor((meta.height - h) / 2);

    // method 1: extract then toBuffer
    const b1 = await sharp(refPath)
        .extract({ left: l, top: t, width: w, height: h })
        .grayscale().raw().toBuffer();

    // method 2: extract then rotate(0) then toBuffer
    const b2 = await sharp(refPath)
        .extract({ left: l, top: t, width: w, height: h })
        .rotate(0)
        .grayscale().raw().toBuffer();

    let diffSq = 0;
    for(let i=0; i<b1.length; i++) {
        const d = b1[i] - b2[i];
        diffSq += d*d;
    }
    console.log("Diff MSE between direct and rotate(0):", diffSq / b1.length);
    
    // Check self-scan logic manually
    // ...
}
debugSelf();
