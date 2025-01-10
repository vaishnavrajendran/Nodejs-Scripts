import("pdfjs-dist").then(({ default: pdfjsLib }) => {
  pdfjsLib.workerSrc = "//mozilla.github.io/pdf.js/build/pdf.worker.js";

  const sharp = require("sharp");
  const fs = require("fs");
  const path = require("path");

  const inputPdfFolder = "./Tamil bikes 100";
  const outputPngFolder = "./outputPngs";

  if (!fs.existsSync(outputPngFolder)) {
    fs.mkdirSync(outputPngFolder);
  }

  async function convertPdfToPng(pdfFilePath, outputPngPath, pageNumber) {
    try {
      const pdfDoc = await pdfjsLib.getDocument(`${pdfFilePath}`).promise;
      const page = await pdfDoc.getPage(pageNumber + 1);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const viewport = page.getViewport({ scale: 2 }); // Scaling
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      const pngBuffer = canvas.toBuffer("image/png");
      await sharp(pngBuffer)
        .toFormat("png")
        .toFile(outputPngPath)
        .then(() =>
          console.log(
            `Successfully converted page ${
              pageNumber + 1
            } to PNG: ${outputPngPath}`
          )
        )
        .catch((err) => console.error(`Error saving PNG: ${err}`));
    } catch (error) {
      console.error(`Error converting PDF to PNG: ${error}`);
    }
  }

  fs.readdirSync(inputPdfFolder).forEach((file) => {
    if (file.endsWith(".pdf")) {
      const pdfFilePath = path.join(inputPdfFolder, file);
      const pdfFileName = path.basename(file, ".pdf");

      pdfjsLib.getDocument(`${pdfFilePath}`).promise.then((pdfDoc_) => {
        const pdfDoc = pdfDoc_;
        const numPages = pdfDoc.numPages;

        // Convert each page to PNG
        for (let i = 0; i < numPages; i++) {
          const outputPngPath = path.join(
            outputPngFolder,
            `${pdfFileName}_page${i + 1}.png`
          );
          convertPdfToPng(pdfFilePath, outputPngPath, i);
        }
      });
    }
  });
});
