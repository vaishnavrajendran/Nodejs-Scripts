const axios = require("axios");

async function verifyAadhaar(inputData) {
  const startTime = performance.now();
  let completedCount = 0;
  const totalCount = inputData.length;

  console.log(`Starting verification for ${totalCount} Aadhaar entries...\n`);

  // Create an array to store all promises
  const allPromises = [];

  // Process each input entry in parallel
  for (const entry of inputData) {
    const { aadhaarNumber, mobileNumber } = entry;

    // Create a promise for this verification request
    const promise = axios
      .post(
        "http://localhost:3000/api/verify",
        {
          aadhaarNumber,
          mobileNumber,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
      .then((response) => {
        // Display result as soon as it's available
        completedCount++;
        console.log(
          `✅ [${completedCount}/${totalCount}] Verified: ${aadhaarNumber} / ${mobileNumber}`
        );
        console.log(`   Result:`, response.data);
        console.log("-----------------------------------");
        return {
          aadhaarNumber,
          mobileNumber,
          success: true,
          data: response.data,
        };
      })
      .catch((error) => {
        // Display error as soon as it occurs
        completedCount++;
        console.error(
          `❌ [${completedCount}/${totalCount}] Failed: ${aadhaarNumber} / ${mobileNumber}`
        );
        console.error(`   Error:`, error.response?.data || error.message);
        console.log("-----------------------------------");
        return {
          aadhaarNumber,
          mobileNumber,
          success: false,
          error: error.response?.data || error.message,
        };
      });

    // Add to our collection of all promises
    allPromises.push(promise);
  }

  // Wait for all requests to complete
  const results = await Promise.all(allPromises);

  // Calculate statistics
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  // Calculate and display timing information
  const endTime = performance.now();
  const totalTimeInSeconds = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n📊 Summary:`);
  console.log(`   Total requests: ${totalCount}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`⏱️ Total time taken: ${totalTimeInSeconds} seconds`);

  return results;
}

// Example input data - replace with your actual data
const inputData = [
  { aadhaarNumber: "835703712264", mobileNumber: "9548021234" },
  { aadhaarNumber: "835703712264", mobileNumber: "9544985802" },
  { aadhaarNumber: "835703712264", mobileNumber: "9548021234" },
  { aadhaarNumber: "835703712264", mobileNumber: "9548021234" },
  { aadhaarNumber: "835703712264", mobileNumber: "9548021234" },
];

// Execute the verification
verifyAadhaar(inputData)
  .then((results) => {
    // You can process the complete results array here if needed
    // console.log('All results:', results);
  })
  .catch((error) => {
    console.error("Error in main execution:", error);
  });
