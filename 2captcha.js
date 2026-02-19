// const axios = require("axios");
// const fs = require("fs");
// const path = require("path");

// class Captcha2Solver {
//   constructor(apiKey = "648899d68e84b24d1859cea2ce23def9") {
//     this.apiKey = apiKey;
//     this.baseUrl = "https://2captcha.com/";
//     this.apiEndpoint = "https://api.2captcha.com/";
//     this.pollingInterval = 5000;
//   }

//   async solveCaptchaFromBase64(base64Image, options = {}) {
//     try {
//       const taskId = await this.createImageToTextTask(base64Image, options);
//       const solution = await this.getTaskResult(taskId);

//       return solution;
//     } catch (error) {
//       console.error("Error solving captcha from base64:", error.message);
//       throw error;
//     }
//   }

//   async solveCaptchaFromUrl(imageUrl, options = {}) {
//     try {
//       const response = await axios.get(imageUrl, {
//         responseType: "arraybuffer",
//         headers: {
//           "User-Agent":
//             "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
//           Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
//           Referer:
//             "https://www.npci.org.in/what-we-do/netc-fastag/check-your-netc-fastag-status",
//         },
//       });

//       const base64Image = Buffer.from(response.data).toString("base64");

//       return this.solveCaptchaFromBase64(base64Image, options);
//     } catch (error) {
//       console.error("Error solving captcha from URL:", error.message);
//       throw error;
//     }
//   }

//   async createImageToTextTask(base64Image, options = {}) {
//     try {
//       const taskData = {
//         clientKey: this.apiKey,
//         task: {
//           type: "ImageToTextTask",
//           body: base64Image,
//           ...this.formatImageToTextOptions(options),
//         },
//         languagePool: "en",
//       };

//       const response = await axios.post(
//         `${this.apiEndpoint}createTask`,
//         taskData,
//         {
//           headers: {
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       if (response.data.errorId !== 0) {
//         throw new Error(
//           `Error creating task: ${response.data.errorDescription}`
//         );
//       }
//       console.log(`Task created with ID: ${response.data.taskId}`);
//       return response.data.taskId;
//     } catch (error) {
//       console.error("Error creating ImageToTextTask:", error.message);
//       throw error;
//     }
//   }

//   async getTaskResult(taskId) {
//     try {
//       let solved = false;
//       let attempts = 0;
//       const maxAttempts = 30;

//       while (!solved && attempts < maxAttempts) {
//         attempts++;
//         await this.sleep(this.pollingInterval);

//         const requestData = {
//           clientKey: this.apiKey,
//           taskId: taskId,
//         };

//         console.log(
//           `Checking task result (attempt ${attempts}/${maxAttempts})...`
//         );
//         const response = await axios.post(
//           `${this.apiEndpoint}getTaskResult`,
//           requestData,
//           {
//             headers: {
//               "Content-Type": "application/json",
//             },
//           }
//         );

//         if (response.data.errorId !== 0) {
//           throw new Error(
//             `Error getting task result: ${response.data.errorDescription}`
//           );
//         }

//         if (response.data.status === "ready") {
//           console.log("Captcha solved successfully!");
//           return response.data.solution.text;
//         } else if (response.data.status !== "processing") {
//           throw new Error(`Unexpected task status: ${response.data.status}`);
//         }
//       }

//       throw new Error("Timeout waiting for captcha solution");
//     } catch (error) {
//       console.error("Error getting task result:", error.message);
//       throw error;
//     }
//   }

//   //   async reportIncorrect(taskId) {
//   //     try {
//   //       const requestData = {
//   //         clientKey: this.apiKey,
//   //         taskId: taskId,
//   //       };

//   //       const response = await axios.post(
//   //         `${this.apiEndpoint}reportIncorrectImageCaptcha`,
//   //         requestData,
//   //         {
//   //           headers: {
//   //             "Content-Type": "application/json",
//   //           },
//   //         }
//   //       );

//   //       return response.data.errorId === 0;
//   //     } catch (error) {
//   //       console.error("Error reporting incorrect captcha:", error.message);
//   //       return false;
//   //     }
//   //   }

//   async getBalance() {
//     try {
//       const requestData = {
//         clientKey: this.apiKey,
//       };

//       const response = await axios.post(
//         `${this.apiEndpoint}getBalance`,
//         requestData,
//         {
//           headers: {
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       if (response.data.errorId !== 0) {
//         throw new Error(
//           `Error getting balance: ${response.data.errorDescription}`
//         );
//       }

//       return parseFloat(response.data.balance);
//     } catch (error) {
//       console.error("Error getting balance:", error.message);
//       throw error;
//     }
//   }

//   formatImageToTextOptions(options) {
//     const formattedOptions = {};
//     if (options.phrase !== undefined) formattedOptions.phrase = options.phrase;
//     if (options.case !== undefined) formattedOptions.case = options.case;
//     if (options.numeric !== undefined)
//       formattedOptions.numeric = options.numeric;
//     if (options.math !== undefined) formattedOptions.math = options.math;
//     if (options.min_len !== undefined)
//       formattedOptions.minLength = options.min_len;
//     if (options.max_len !== undefined)
//       formattedOptions.maxLength = options.max_len;
//     if (options.comment) formattedOptions.comment = options.comment;
//     if (options.imgInstructions)
//       formattedOptions.imgInstructions = options.imgInstructions;

//     return formattedOptions;
//   }

//   sleep(ms) {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }
// }

// async function main() {
//   try {
//     const solver = new Captcha2Solver();

//     const balance = await solver.getBalance();
//     if (balance < 0.5) {
//       throw new Error("Insufficient balance");
//     }
//     console.log("\nAccount balance:", balance);

//     const captchaUrl = "https://www.npci.org.in/netc_api/netc_fasttag/file";
//     const solution2 = await solver.solveCaptchaFromUrl(captchaUrl, {
//       numeric: 1,
//     });
//     console.log("Solution:", solution2);
//   } catch (error) {
//     console.error("Error in main:", error.message);
//   }
// }

// main();

// module.exports = Captcha2Solver;
