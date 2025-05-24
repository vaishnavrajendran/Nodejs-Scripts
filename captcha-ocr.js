const fs = require("fs");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");

const runOCR = async () => {
  try {
    const inputPath = "./image.png";

    const processedBuffer = await sharp(inputPath)
      .resize({ width: 400 }) // enlarge for better OCR
      .grayscale()
      .normalize() // increase contrast
      .threshold(160) // binarize
      .toBuffer();

    console.log("processedBuffer", processedBuffer);

    const {
      data: { text },
    } = await Tesseract.recognize(processedBuffer, "eng", {
      tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    });

    console.log("text>>>>>>>", text);

    const cleaned = text.replace(/[^\w]/g, "");
    console.log("Detected Text:", cleaned);
  } catch (error) {
    console.error("Error during OCR:", error.message);
  }
};

runOCR();
