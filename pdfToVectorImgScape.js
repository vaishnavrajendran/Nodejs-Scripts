// const { exec } = require("child_process");
// const fs = require("fs");
// const path = require("path");

// // Configuration
// const inputPdfFolder = "./Tamil bikes 100"; // Folder containing input PDFs
// const tempSvgFolder = "./tempSvgs"; // Temporary folder for SVGs
// const outputPdfFolder = "./outputVectorPdfs"; // Output folder for vectorized PDFs
// const dpi = 300; // DPI for output PDFs

// // Ensure folders exist
// [outputPdfFolder, tempSvgFolder].forEach((folder) => {
//   if (!fs.existsSync(folder)) {
//     fs.mkdirSync(folder);
//   }
// });

// // Function to convert a PDF to a vectorized PDF
// function convertPdfToVectorPdf(pdfFilePath) {
//   const pdfFileName = path.basename(pdfFilePath, ".pdf");
//   const tempSvgPath = path.join(tempSvgFolder, `${pdfFileName}.svg`);
//   const outputPdfPath = path.join(outputPdfFolder, `${pdfFileName}_vector.pdf`);

//   // Step 1: Convert PDF to SVG using pdftocairo
//   const pdfToSvgCommand = `pdftocairo -svg -r ${dpi} "${pdfFilePath}" "${tempSvgPath}"`;
//   exec(pdfToSvgCommand, (error, stdout, stderr) => {
//     if (error) {
//       console.error(`Error converting ${pdfFileName}.pdf to SVG:`, error);
//       return;
//     }
//     console.log(`Successfully converted ${pdfFileName}.pdf to SVG`);

//     // Step 2: Convert SVG to vectorized PDF using inkscape
//     const svgToPdfCommand = `inkscape -d ${dpi} --export-type=pdf "${tempSvgPath}" --export-file="${outputPdfPath}"`;
//     exec(svgToPdfCommand, (error, stdout, stderr) => {
//       if (error) {
//         console.error(
//           `Error converting ${pdfFileName}.svg to vectorized PDF:`,
//           error
//         );
//         return;
//       }
//       console.log(
//         `Successfully converted ${pdfFileName}.svg to vectorized PDF`
//       );

//       // Optional: Remove temporary SVG file
//       fs.unlinkSync(tempSvgPath);
//       console.log(`Removed temporary SVG file for ${pdfFileName}`);
//     });
//   });
// }

// // Process all PDFs in the input folder
// fs.readdirSync(inputPdfFolder).forEach((file) => {
//   if (file.endsWith(".pdf")) {
//     const pdfFilePath = path.join(inputPdfFolder, file);
//     convertPdfToVectorPdf(pdfFilePath);
//   }
// });

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const inputPdfFolder = "./Tamil bikes 100";
const tempSvgFolder = "./tempSvgs";
const outputPdfFolder = "./outputVectorPdfs";
const outputPngFolder = "./outputPngs";
const dpi = 600; // DPI for clarity

// Ensure folders exist
[outputPdfFolder, outputPngFolder, tempSvgFolder].forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
});

function convertPdfToVectorPdfAndPng(pdfFilePath) {
  const pdfFileName = path.basename(pdfFilePath, ".pdf");
  const tempSvgPath = path.join(tempSvgFolder, `${pdfFileName}.svg`);
  const outputPdfPath = path.join(outputPdfFolder, `${pdfFileName}_vector.pdf`);
  const outputPngPath = path.join(outputPngFolder, `${pdfFileName}_vector.png`);

  const pdfToSvgCommand = `pdftocairo -svg -r ${dpi} "${pdfFilePath}" "${tempSvgPath}"`;
  exec(pdfToSvgCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error converting ${pdfFileName}.pdf to SVG:`, error);
      return;
    }
    console.log(`Successfully converted ${pdfFileName}.pdf to SVG`);

    const svgToPdfCommand = `inkscape -d ${dpi} --export-type=pdf --export-pdf="${outputPdfPath}" "${tempSvgPath}"`;
    exec(svgToPdfCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(
          `Error converting ${pdfFileName}.svg to vectorized PDF:`,
          error
        );
        return;
      }
      console.log(
        `Successfully converted ${pdfFileName}.svg to vectorized PDF`
      );

      const pdfToPngCommand = `magick -density ${dpi} -intent Perceptual "${outputPdfPath}" +compress -sharpen 0x1.5 -quality 95 "${outputPngPath}"`;
      exec(pdfToPngCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `Error converting ${pdfFileName}_vector.pdf to PNG:`,
            error
          );
          return;
        }
        console.log(
          `Successfully converted ${pdfFileName}_vector.pdf to PNG with clarity tweaks`
        );

        fs.unlinkSync(tempSvgPath);
        console.log(`Removed temporary SVG file for ${pdfFileName}`);
      });
    });
  });
}

// Process all PDFs in the input folder
fs.readdirSync(inputPdfFolder).forEach((file) => {
  if (file.endsWith(".pdf")) {
    const pdfFilePath = path.join(inputPdfFolder, file);
    convertPdfToVectorPdfAndPng(pdfFilePath);
  }
});
