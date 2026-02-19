/**
 * PDF to Image Converter for Node.js
 * This script converts the first page of a PDF file to a PNG image
 * It uses pdf-parse to extract PDF data and sharp for image processing
 */

// Required packages - you'll need to install these first:
// npm install pdf-parse sharp
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const sharp = require("sharp");

/**
 * Converts the first page of a PDF to an image
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} outputPath - Path where the image will be saved
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - Path to the saved image
 */
async function convertFirstPageToImage(pdfPath, outputPath, options = {}) {
  try {
    // Default options
    const defaultOptions = {
      density: 300, // DPI for rendering (higher = better quality)
      format: "png", // Output format
      quality: 100, // Image quality (1-100)
      page: 0, // First page (0-indexed)
    };

    const settings = { ...defaultOptions, ...options };

    // Read the PDF file
    const dataBuffer = fs.readFileSync(pdfPath);

    console.log("DATABUFFER=======>", dataBuffer);

    // Get PDF info
    const pdfData = await pdfParse(dataBuffer);
    console.log(`PDF loaded successfully. Total pages: ${pdfData.numpages}`);

    // Use sharp to convert PDF to image
    // Sharp uses Ghostscript under the hood for PDF processing
    // For PDFs, we need to specify the page using the 'page' option in the constructor
    await sharp(dataBuffer, {
      density: settings.density,
      pages: 1, // Process only 1 page
      page: settings.page, // Start with the specified page (0-based index)
    })
      .toFormat(settings.format, { quality: settings.quality })
      .toFile(outputPath);

    console.log(`Image saved successfully to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("Error converting PDF to image:", error);
    throw error;
  }
}

// Example usage
const pdfFilePath = "./MP13ZW5909.pdf"; // Change this to your PDF file path
const outputImagePath = "./output.png";

// Call the function with custom options if needed
convertFirstPageToImage(pdfFilePath, outputImagePath, {
  density: 300, // Higher density for better quality
  quality: 100, // Maximum quality
})
  .then((imagePath) => {
    console.log(`Process completed. Image saved at: ${imagePath}`);
  })
  .catch((error) => {
    console.error("Failed to convert PDF:", error);
  });
