const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const https = require("https");

/**
 * Captcha2Solver - A class for solving captchas using the 2Captcha service
 */
class Captcha2Solver {
  constructor(apiKey = "648899d68e84b24d1859cea2ce23def9") {
    this.apiKey = apiKey;
    this.baseUrl = "https://2captcha.com/";
    this.apiEndpoint = "https://api.2captcha.com/";
    this.pollingInterval = 5000;
  }

  async solveCaptchaFromBase64(base64Image, options = {}) {
    try {
      const taskId = await this.createImageToTextTask(base64Image, options);
      const solution = await this.getTaskResult(taskId);

      return solution;
    } catch (error) {
      console.error("Error solving captcha from base64:", error.message);
      throw error;
    }
  }

  async solveCaptchaFromUrl(imageUrl, options = {}) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer:
            "https://www.npci.org.in/what-we-do/netc-fastag/check-your-netc-fastag-status",
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });

      const base64Image = Buffer.from(response.data).toString("base64");

      return this.solveCaptchaFromBase64(base64Image, options);
    } catch (error) {
      console.error("Error solving captcha from URL:", error.message);
      throw error;
    }
  }

  async createImageToTextTask(base64Image, options = {}) {
    try {
      const taskData = {
        clientKey: this.apiKey,
        task: {
          type: "ImageToTextTask",
          body: base64Image,
          ...this.formatImageToTextOptions(options),
        },
        languagePool: "en",
      };

      const response = await axios.post(
        `${this.apiEndpoint}createTask`,
        taskData,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.errorId !== 0) {
        throw new Error(
          `Error creating task: ${response.data.errorDescription}`
        );
      }
      console.log(`Task created with ID: ${response.data.taskId}`);
      return response.data.taskId;
    } catch (error) {
      console.error("Error creating ImageToTextTask:", error.message);
      throw error;
    }
  }

  async getTaskResult(taskId) {
    try {
      let solved = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!solved && attempts < maxAttempts) {
        attempts++;
        await this.sleep(this.pollingInterval);

        const requestData = {
          clientKey: this.apiKey,
          taskId: taskId,
        };

        console.log(
          `Checking task result (attempt ${attempts}/${maxAttempts})...`
        );
        const response = await axios.post(
          `${this.apiEndpoint}getTaskResult`,
          requestData,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.errorId !== 0) {
          throw new Error(
            `Error getting task result: ${response.data.errorDescription}`
          );
        }

        if (response.data.status === "ready") {
          console.log("Captcha solved successfully!");
          return response.data.solution.text;
        } else if (response.data.status !== "processing") {
          throw new Error(`Unexpected task status: ${response.data.status}`);
        }
      }

      throw new Error("Timeout waiting for captcha solution");
    } catch (error) {
      console.error("Error getting task result:", error.message);
      throw error;
    }
  }

  async reportIncorrect(taskId) {
    try {
      const requestData = {
        clientKey: this.apiKey,
        taskId: taskId,
      };

      const response = await axios.post(
        `${this.apiEndpoint}reportIncorrectImageCaptcha`,
        requestData,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      return response.data.errorId === 0;
    } catch (error) {
      console.error("Error reporting incorrect captcha:", error.message);
      return false;
    }
  }

  async getBalance() {
    try {
      const requestData = {
        clientKey: this.apiKey,
      };

      const response = await axios.post(
        `${this.apiEndpoint}getBalance`,
        requestData,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.errorId !== 0) {
        throw new Error(
          `Error getting balance: ${response.data.errorDescription}`
        );
      }

      return parseFloat(response.data.balance);
    } catch (error) {
      console.error("Error getting balance:", error.message);
      throw error;
    }
  }

  formatImageToTextOptions(options) {
    const formattedOptions = {};
    if (options.phrase !== undefined) formattedOptions.phrase = options.phrase;
    if (options.case !== undefined) formattedOptions.case = options.case;
    if (options.numeric !== undefined)
      formattedOptions.numeric = options.numeric;
    if (options.math !== undefined) formattedOptions.math = options.math;
    if (options.min_len !== undefined)
      formattedOptions.minLength = options.min_len;
    if (options.max_len !== undefined)
      formattedOptions.maxLength = options.max_len;
    if (options.comment) formattedOptions.comment = options.comment;
    if (options.imgInstructions)
      formattedOptions.imgInstructions = options.imgInstructions;

    return formattedOptions;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * NPCIFastTagChecker - A class for checking FastTag status using the NPCI API
 */
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

    this.captchaApiKey = captchaApiKey;
    this.captchaFile = "latest_captcha.png";
    this.captchaSolver = null;
  }

  // Initialize captcha solver only when needed
  getCaptchaSolver() {
    if (!this.captchaSolver) {
      this.captchaSolver = new Captcha2Solver(this.captchaApiKey);
    }
    return this.captchaSolver;
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
        httpsAgent: new https.Agent({
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
      const solver = this.getCaptchaSolver();
      const solution = await solver.solveCaptchaFromUrl(this.captchaUrl, {
        numeric: 1, // Only digits
      });

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
              // Convert header names to camelCase for JSON
              const headerKey = headers[j].replace(/ /g, "_").toLowerCase();
              rowData[headerKey] = $(td).text().trim();
            }
          });
        rows.push(rowData);
      });

      return {
        success: true,
        total_tags: rows.length,
        active_tags: rows.filter(
          (tag) => tag.tag_status && tag.tag_status.toUpperCase() === "ACTIVE"
        ).length,
        fasttags: rows,
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

      console.log("PAYLOAD", payload);

      // URL encode the payload
      const data = `payLoad=${encodeURIComponent(JSON.stringify(payload))}`;

      console.log("DATA", data);

      // Send request
      const response = await axios.post(this.statusUrl, data, {
        headers: statusHeaders,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });

      // Save the raw response for debugging
      const debugFilePath = path.join(__dirname, "response_debug.txt");
      fs.writeFileSync(debugFilePath, response.data);
      console.log(`Response saved to ${debugFilePath} for debugging`);

      // Try to parse as JSON first
      try {
        if (typeof response.data === "object") {
          console.log("JSON RESPONSE", response.data);
          return response.data;
        }

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
      } catch (error) {
        console.error("Error parsing response:", error.message);
        return { error: `Failed to parse response: ${error.message}` };
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

        // Report incorrect captcha if we have a taskId
        if (this.captchaSolver && this.captchaSolver.lastTaskId) {
          await this.captchaSolver.reportIncorrect(
            this.captchaSolver.lastTaskId
          );
          console.log("Reported incorrect captcha to 2Captcha");
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      return status;
    }

    return { error: `Failed to process after ${maxAttempts} attempts` };
  }

  async checkBalance() {
    try {
      const solver = this.getCaptchaSolver();
      const balance = await solver.getBalance();
      return balance;
    } catch (error) {
      console.error("Error checking balance:", error.message);
      return null;
    }
  }
}

/**
 * Main function to run the FastTag checker
 */
async function main() {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // Create the checker instance
    const checker = new NPCIFastTagChecker();

    // Check 2Captcha balance first
    const balance = await checker.checkBalance();
    if (balance !== null) {
      console.log(`\n2Captcha account balance: ${balance}`);
      if (balance < 0.1) {
        console.warn("WARNING: Low balance on 2Captcha account!");
      }
    }

    // Get vehicle number from user
    const getVehicleNumber = () => {
      return new Promise((resolve) => {
        readline.question(
          "Enter vehicle registration number (e.g., KA12AB1234) or 'q' to quit: ",
          (input) => {
            resolve(input);
          }
        );
      });
    };

    let vehicleNumber = await getVehicleNumber();

    while (vehicleNumber && vehicleNumber.toLowerCase() !== "q") {
      if (!vehicleNumber || vehicleNumber.trim() === "") {
        console.log("Vehicle number is required");
      } else {
        vehicleNumber = vehicleNumber.trim().toUpperCase();
        console.log(`\nProcessing vehicle number: ${vehicleNumber}`);

        // Process the vehicle
        const result = await checker.processVehicle(vehicleNumber);

        console.log("\nFastTag Status Result:");
        console.log(JSON.stringify(result, null, 2));
      }

      // Ask for another vehicle number
      vehicleNumber = await getVehicleNumber();
    }

    console.log("Exiting program. Goodbye!");
  } catch (error) {
    console.error("Error in main program:", error.message);
  } finally {
    readline.close();
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}

// Export classes for use in other modules
module.exports = {
  NPCIFastTagChecker,
  Captcha2Solver,
};
