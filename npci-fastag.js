const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const Captcha2Solver = require("./captcha2solver");

class NPCIFastTagChecker {
  constructor(captchaApiKey = "648899d68e84b24d1859cea2ce23def9") {
    this.baseUrl = "https://www.npci.org.in";
    this.captchaUrl = `${this.baseUrl}/netc_api/netc_fasttag/file`;
    this.statusUrl = `${this.baseUrl}/netc_api/NETC_FastTag/GetTagStatus`;
    this.headers = {
      accept: "*/*",
      "accept-language": "en-GB,en;q=0.5",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "sec-ch-ua": '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "sec-gpc": "1",
      referer:
        "https://www.npci.org.in/what-we-do/netc-fastag/check-your-netc-fastag-status",
    };

    this.captchaSolver = new Captcha2Solver(captchaApiKey);
    this.captchaFile = "latest_captcha.png";
  }

  async fetchCaptcha() {
    try {
      console.log("Fetching captcha from NPCI...");

      // Add specific headers for captcha request
      const captchaHeaders = {
        ...this.headers,
        accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        priority: "u=2, i",
      };

      const response = await axios.get(this.captchaUrl, {
        headers: captchaHeaders,
        responseType: "arraybuffer",
        httpsAgent: new (require("https").Agent)({
          rejectUnauthorized: false,
        }),
      });

      // Save the image to a file
      fs.writeFileSync(this.captchaFile, response.data);
      console.log("Captcha image saved as 'latest_captcha.png'");

      return response.data;
    } catch (error) {
      console.error("Error fetching captcha:", error.message);
      return null;
    }
  }

  async decodeCaptcha() {
    try {
      console.log("Solving captcha using 2Captcha service...");
      const solution = await this.captchaSolver.solveCaptchaFromUrl(
        this.captchaUrl,
        {
          numeric: 1, // Only digits
        }
      );

      console.log(`Captcha solved: ${solution}`);
      return solution;
    } catch (error) {
      console.error("Error decoding captcha:", error.message);
      return null;
    }
  }

  parseHtmlTable(htmlContent) {
    try {
      const $ = cheerio.load(htmlContent);
      const table = $("table.table-bordered");

      if (table.length === 0) {
        return { error: "No table found in the response" };
      }

      // Extract headers
      const headers = [];
      table.find("thead th").each((i, el) => {
        headers.push($(el).text().trim());
      });

      // Extract rows
      const rows = [];
      table.find("tbody tr").each((i, tr) => {
        const rowData = {};
        $(tr)
          .find("td")
          .each((j, td) => {
            if (j < headers.length) {
              rowData[headers[j]] = $(td).text().trim();
            }
          });
        rows.push(rowData);
      });

      return {
        success: true,
        vehicle_data: rows,
      };
    } catch (error) {
      return { error: `Failed to parse HTML table: ${error.message}` };
    }
  }

  async checkFastTagStatus(vehicleNumber, captchaText) {
    try {
      console.log(
        `Checking FastTag status for vehicle ${vehicleNumber} with captcha ${captchaText}...`
      );

      // Add specific headers for status request
      const statusHeaders = {
        ...this.headers,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        origin: this.baseUrl,
        priority: "u=0, i",
        "x-requested-with": "XMLHttpRequest",
      };

      // Prepare payload
      const payload = {
        checkBy: "vrn",
        vrn: vehicleNumber,
        tagId: null,
        Captcha: captchaText,
      };

      // URL encode the payload
      const data = `payLoad=${encodeURIComponent(JSON.stringify(payload))}`;

      // Send request
      const response = await axios.post(this.statusUrl, data, {
        headers: statusHeaders,
        httpsAgent: new (require("https").Agent)({
          rejectUnauthorized: false,
        }),
      });

      // Save the raw response for debugging
      fs.writeFileSync("response_debug.txt", response.data);

      // Try to parse as JSON first
      try {
        return response.data;
      } catch (error) {
        // Not valid JSON, handle as HTML
        const htmlContent = response.data;

        // Check if the response contains "No records found" message
        if (htmlContent.includes("No records found")) {
          return {
            success: false,
            message: "No records found for this vehicle number",
          };
        }

        // Parse the HTML table into structured data
        return this.parseHtmlTable(htmlContent);
      }
    } catch (error) {
      console.error("Error checking FastTag status:", error.message);
      return { error: error.message };
    }
  }

  async processVehicle(vehicleNumber, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\nAttempt ${attempt} for vehicle ${vehicleNumber}`);

      // Fetch captcha directly from URL and decode using 2Captcha
      const captchaText = await this.decodeCaptcha();

      if (!captchaText) {
        console.log("Failed to decode captcha. Retrying...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      console.log(`Decoded captcha: ${captchaText}`);

      // Check FastTag status
      const status = await this.checkFastTagStatus(vehicleNumber, captchaText);

      // Check if the response indicates a captcha error
      if (
        status &&
        status.error &&
        status.error.toLowerCase().includes("captcha")
      ) {
        console.log("Captcha validation failed. Retrying...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      return status;
    }

    return { error: `Failed to process after ${maxAttempts} attempts` };
  }
}

function parseHtmlToJson(htmlContent) {
  try {
    const $ = cheerio.load(htmlContent);
    const table = $("table.table-bordered");

    if (table.length === 0) {
      return { error: "No table found in the HTML content" };
    }

    // Extract headers
    const headers = [];
    table.find("thead th").each((i, el) => {
      headers.push($(el).text().trim());
    });

    // Extract rows
    const fasttags = [];
    table.find("tbody tr").each((i, tr) => {
      const rowData = {};
      $(tr)
        .find("td")
        .each((j, td) => {
          if (j < headers.length) {
            // Convert header names to camelCase for JSON
            const headerKey = headers[j].replace(/ /g, "_").toLowerCase();
            rowData[headerKey] = $(td).text().trim();
          }
        });
      fasttags.push(rowData);
    });

    return {
      success: true,
      total_tags: fasttags.length,
      active_tags: fasttags.filter(
        (tag) => tag.tag_status && tag.tag_status.toUpperCase() === "ACTIVE"
      ).length,
      fasttags: fasttags,
    };
  } catch (error) {
    return { error: `Failed to parse HTML: ${error.message}` };
  }
}

async function main() {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.question(
    "Enter vehicle registration number (e.g., KA12AB1234): ",
    async (vehicleNumber) => {
      const checker = new NPCIFastTagChecker();
      const result = await checker.processVehicle(
        vehicleNumber.trim().toUpperCase()
      );

      console.log("\nFastTag Status Result:");
      console.log(JSON.stringify(result, null, 2));

      readline.close();
    }
  );
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = NPCIFastTagChecker;
