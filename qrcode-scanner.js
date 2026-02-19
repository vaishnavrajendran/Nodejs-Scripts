const sharp = require("sharp");
const jsQR = require("jsqr");
const fs = require("fs");

async function scanQRCode(imagePath) {
  try {
    if (!fs.existsSync(imagePath)) {
      console.error("File not found:", imagePath);
      return;
    }

    const image = sharp(imagePath);

    // Ensure the image has an alpha channel and extract raw pixel data
    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // jsQR expects a Uint8ClampedArray
    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    if (code) {
      console.log("QR Code Content:", code.data);
    } else {
      console.log("No QR code found.");
    }
  } catch (error) {
    console.error("Error scanning QR code:", error);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node qrcode-scanner.js <image-path>");
} else {
  scanQRCode(args[0]);
}
