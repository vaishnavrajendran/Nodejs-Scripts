const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

// Configuration
const pdfFolder = "./Tamil bikes 100";
const tempImageFolder = "./tempImages";
const outputPdfFolder = "./outputPdfs";
const imageFormat = "tiff";

[outputPdfFolder, tempImageFolder].forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
});

async function convertPdfToHighQualityPdf(pdfFilePath) {
  const pdfFileName = path.basename(pdfFilePath, ".pdf");
  const tempImagePath = path.join(tempImageFolder, `${pdfFileName}`);
  const outputPath = path.join(outputPdfFolder, `${pdfFileName}.pdf`);

  try {
    const pdfToImageCommand = [
      "pdftocairo",
      "-tiff",
      "-r 300",
      "-singlefile",
      "-scale-to 2000",
      `-f 1 -l 1`, // First page only
      `"${pdfFilePath}"`,
      `"${tempImagePath}"`, // Output file
    ].join(" ");

    console.log(`Converting ${pdfFileName} to TIFF...`);
    await exec(pdfToImageCommand);

    // Step 2: Convert TIFF to PDF using ImageMagick with high-quality settings
    const imageToPdfCommand = [
      "convert",
      `"${tempImagePath}.tif"`,
      "-compress jpeg",
      "-quality 100",
      "-density 300x300",
      `"${outputPath}"`,
    ].join(" ");

    console.log(`Converting TIFF back to PDF...`);
    await exec(imageToPdfCommand);

    // Clean up temporary file
    fs.unlinkSync(`${tempImagePath}.tif`);
    console.log(`Successfully processed: ${pdfFileName}`);
  } catch (error) {
    console.error(`Error processing ${pdfFileName}:`, error.message);
  }
}

async function processAllPdfs() {
  const files = fs
    .readdirSync(pdfFolder)
    .filter((file) => file.toLowerCase().endsWith(".pdf"));

  console.log(`Found ${files.length} PDF files to process`);

  for (const file of files) {
    const pdfFilePath = path.join(pdfFolder, file);
    console.log(`Processing: ${file}`);
    await convertPdfToHighQualityPdf(pdfFilePath);
  }
}

processAllPdfs()
  .then(() => {
    console.log("All PDFs processed");
  })
  .catch((error) => {
    console.error("Error during processing:", error);
  });
