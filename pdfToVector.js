const fs = require("fs").promises;
const PDFParser = require("pdf2json");

async function convertPDFtoVector(inputPath, outputPath) {
  try {
    const pdfData = await new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on("pdfParser_dataReady", (pdfData) => {
        resolve(pdfData);
      });

      pdfParser.on("pdfParser_dataError", (error) => {
        reject(error);
      });

      pdfParser.loadPDF(inputPath);
    });

    const page = pdfData.Pages[0];
    const width = page.Width * 10;
    const height = page.Height * 10;

    // Initialize SVG content
    let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${width}" 
     height="${height}" 
     viewBox="0 0 ${width} ${height}">
    <defs>
        <style>
            .filled-shape { fill: #000000; }
            .stroked-shape { fill: none; stroke: #000000; stroke-width: 1; }
            text { font-family: Arial, sans-serif; }
        </style>
    </defs>`;

    if (page.Fills) {
      page.Fills.forEach((fill, index) => {
        const points = fill.points
          .map((p) => `${p.x * 10},${p.y * 10}`)
          .join(" ");
        svgContent += `
    <polygon class="filled-shape" points="${points}"/>`;
      });
    }

    if (page.Lines) {
      page.Lines.forEach((line, index) => {
        if (line.points && line.points.length > 1) {
          const pathData = line.points
            .map((p, i) => {
              return i === 0
                ? `M ${p.x * 10} ${p.y * 10}`
                : `L ${p.x * 10} ${p.y * 10}`;
            })
            .join(" ");

          svgContent += `
    <path class="stroked-shape" d="${pathData}"/>`;
        }
      });
    }

    if (page.Texts) {
      page.Texts.forEach((text) => {
        const x = text.x * 10;
        const y = text.y * 10;
        const decodedText = decodeURIComponent(text.R[0].T);
        const fontSize = text.R[0].TS[2] || 12;

        svgContent += `
    <text x="${x}" y="${y}" font-size="${fontSize}px">${decodedText}</text>`;
      });
    }

    svgContent += "\n</svg>";

    await fs.writeFile(outputPath, svgContent);

    console.log(
      `Successfully converted ${inputPath} to SVG vector format at ${outputPath}`
    );
    console.log(`SVG dimensions: ${width}x${height}`);

    const stats = {
      fills: page.Fills ? page.Fills.length : 0,
      lines: page.Lines ? page.Lines.length : 0,
      texts: page.Texts ? page.Texts.length : 0,
    };
    console.log("Conversion statistics:", stats);
  } catch (error) {
    console.error("Error during conversion:", error);
    throw error;
  }
}

const inputPDF = "./131007.pdf";
const outputSVG = "./output.svg";

async function main() {
  try {
    await convertPDFtoVector(inputPDF, outputSVG);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
