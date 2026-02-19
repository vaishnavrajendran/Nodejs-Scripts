const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { createObjectCsvWriter } = require("csv-writer");

// ─── Config ──────────────────────────────────────────────────────────────────
const INPUT_CSV = path.join(__dirname, "activations.csv"); // Change to "activations-og.csv" for real data
const INPUT_BASENAME = path.basename(INPUT_CSV, path.extname(INPUT_CSV));
const OUTPUT_CSV = path.join(__dirname, `output-${INPUT_BASENAME}.csv`);
const PROGRESS_FILE = path.join(__dirname, `progress-${INPUT_BASENAME}.json`);
const API_URL =
  "https://api.highwaydelite.com/fastag-service/api/v5/fastag/icici/fetch-customer-vehicles";
const RATE_LIMIT = 30; // max requests per minute
const DELAY_MS = (60 / RATE_LIMIT) * 1000; // 2 seconds between each call

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      // Validate structure
      if (
        typeof data.lastProcessedIndex === "number" &&
        Array.isArray(data.results)
      ) {
        console.log(`📂 Resuming from row ${data.lastProcessedIndex + 1}`);
        return data;
      }
    }
  } catch (err) {
    console.log(
      "⚠️  Could not load progress file or invalid format, starting fresh."
    );
  }
  return { lastProcessedIndex: -1, results: [] };
}

// Save progress to JSON and overwrite CSV with latest full results
async function saveProgress(index, results) {
  try {
    // 1. Save JSON Progress
    fs.writeFileSync(
      PROGRESS_FILE,
      JSON.stringify({ lastProcessedIndex: index, results }, null, 2)
    );

    // 2. Save CSV Output (Overwrite with full history)
    // We recreate the writer to ensure we overwrite/start fresh each time with the full set
    const csvWriter = createObjectCsvWriter({
      path: OUTPUT_CSV,
      header: [
        { id: "serialNumber", title: "serialNumber" },
        { id: "chassisNumber", title: "chassisNumber" },
        { id: "csvVehicleNumber", title: "csvVehicleNumber" },
        { id: "customerId", title: "customerId" },
        { id: "apiVehicleNumber", title: "apiVehicleNumber" },
        { id: "customerName", title: "customerName" },
        { id: "tagAccountNumber", title: "tagAccountNumber" },
        { id: "status", title: "status" },
        { id: "remarks", title: "remarks" },
      ],
      // append: false is default, which means it will overwrite the file if we writeRecords
      // However, createObjectCsvWriter doesn't truncate on *creation*, only on *write*.
      // But since we are creating a new writer instance and calling writeRecords once with EVERYTHING,
      // it should overwrite correctly. To be safe, we can delete the file first if we want,
      // but writeRecords usually handles 'w' flag.
    });

    if (results.length > 0) {
      await csvWriter.writeRecords(results);
    }
  } catch (error) {
    console.error("❌ Error saving progress/CSV:", error);
  }
}

async function fetchCustomerVehicles(customerId) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId: Number(customerId) }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// ─── Read CSV ────────────────────────────────────────────────────────────────
function readCsv() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(INPUT_CSV)
      .pipe(csv())
      .on("data", (row) => {
        rows.push({
          serialNumber: (row.serialNumber || "").replace(/"/g, "").trim(),
          chassisNumber: (row.chassisNumber || "").replace(/"/g, "").trim(),
          vehicleNumber: (row.vehicleNumber || "").replace(/"/g, "").trim(),
          customerId: (row.customerId || "").replace(/"/g, "").trim(),
        });
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 Starting VRN Update Check for ${INPUT_BASENAME}...`);
  console.log(
    `⏱️  Rate limit: ${RATE_LIMIT} requests/minute (${DELAY_MS}ms between each)\n`
  );

  const rows = await readCsv();
  console.log(`📄 Total rows in CSV: ${rows.length}\n`);

  const progress = loadProgress();
  const startIndex = progress.lastProcessedIndex + 1;
  const results = progress.results; // Reference to the accumulating results array

  // Global handler for SIGINT (Ctrl+C)
  let isSaving = false;

  // Since we need to track `i` for the SIGINT handler, let's define it outside.
  let currentProcessingIndex = startIndex - 1;

  process.on("SIGINT", async () => {
    if (isSaving) return;
    isSaving = true;
    console.log(
      `\n🛑 Interrupted! Saving progress at CSV row index: ${currentProcessingIndex}`
    );
    await saveProgress(currentProcessingIndex, results);
    console.log("✅ Progress saved. Exiting.");
    process.exit(0);
  });

  // Initialize/Update progress file immediately so it exists upfront
  await saveProgress(progress.lastProcessedIndex, results);
  console.log(`💾 Progress file initialized at: ${PROGRESS_FILE}\n`);

  let processedInThisBatch = 0;

  for (let i = startIndex; i < rows.length; i++) {
    currentProcessingIndex = i; // Track for SIGINT
    const row = rows[i];
    const { serialNumber, chassisNumber, vehicleNumber, customerId } = row;

    if (!customerId) {
      results.push({
        serialNumber,
        chassisNumber,
        csvVehicleNumber: vehicleNumber,
        customerId,
        apiVehicleNumber: "",
        customerName: "",
        tagAccountNumber: "",
        status: "SKIPPED",
        remarks: "No customerId in CSV",
      });
    } else {
      try {
        const response = await fetchCustomerVehicles(customerId);
        const data = response.data;

        if (!data || !data.IsSuccess) {
          results.push({
            serialNumber,
            chassisNumber,
            csvVehicleNumber: vehicleNumber,
            customerId,
            apiVehicleNumber: "",
            customerName: "",
            tagAccountNumber: "",
            status: "API_ERROR",
            remarks: data?.Messages?.join("; ") || "API returned unsuccessful",
          });
        } else {
          const vehicles = data.Vehicles || [];
          const customerName = data.CustomerName || "";

          if (vehicles.length === 0) {
            results.push({
              serialNumber,
              chassisNumber,
              csvVehicleNumber: vehicleNumber,
              customerId,
              apiVehicleNumber: "",
              customerName,
              tagAccountNumber: "",
              status: "NO_VEHICLES",
              remarks: "No vehicles returned from API",
            });
          } else {
            for (const vehicle of vehicles) {
              const apiVehicleNum = (vehicle.VehicleNumber || "")
                .trim()
                .toUpperCase();
              const tagAccountNumber = vehicle.TagAccountNumber || "";
              let status = "";
              let remarks = "";

              const csvChassis = chassisNumber.toUpperCase();
              const csvVrn = vehicleNumber.toUpperCase();

              // Matches?
              const apiMatchesChassis =
                csvChassis && apiVehicleNum === csvChassis;
              const apiMatchesVrn = csvVrn && apiVehicleNum === csvVrn;

              if (apiMatchesChassis && csvVrn) {
                status = "VRN_NOT_UPDATED_AT_ICICI";
                remarks = `API has chassis: ${apiVehicleNum}, CSV has VRN: ${csvVrn}`;
              } else if (apiMatchesVrn) {
                status = "VRN_MATCHED";
                remarks = "VRN is same in both API and CSV";
              } else if (apiMatchesChassis && !csvVrn) {
                status = "VRN_NOT_AVAILABLE";
                remarks = "Both API and CSV have chassis, no VRN available";
              } else if (!apiMatchesChassis && !apiMatchesVrn) {
                status = "VRN_AND_CHASSIS_NOT_MATCHING";
                remarks = `API has VRN: ${apiVehicleNum}, but CSV has no vehicleNumber`;
              }

              results.push({
                serialNumber,
                chassisNumber,
                csvVehicleNumber: vehicleNumber,
                customerId,
                apiVehicleNumber: apiVehicleNum,
                customerName,
                tagAccountNumber,
                status,
                remarks,
              });
            }
          }
        }
      } catch (err) {
        results.push({
          serialNumber,
          chassisNumber,
          csvVehicleNumber: vehicleNumber,
          customerId,
          apiVehicleNumber: "",
          customerName: "",
          tagAccountNumber: "",
          status: "ERROR",
          remarks: err.message,
        });
      }

      // Wait only if we did an API call
      await sleep(DELAY_MS);
    }

    processedInThisBatch++;

    // Save progress MORE FREQUENTLY (Every 5 processed rows)
    if (processedInThisBatch % 5 === 0) {
      await saveProgress(i, results);
      console.log(`💾 Progress & CSV saved at row ${i + 1}`);
    }

    // Log progress
    if (processedInThisBatch % 10 === 0) {
      console.log(
        `✅ Processed ${i + 1}/${rows.length} | Results so far: ${results.length}`
      );
    }
  }

  // Final Save
  await saveProgress(rows.length - 1, results);
  console.log(`\n🎉 Done! Output written to: ${OUTPUT_CSV}`);
  console.log(`📊 Total results: ${results.length}`);

  // Print summary
  const summary = {};
  for (const r of results) {
    summary[r.status] = (summary[r.status] || 0) + 1;
  }
  console.log("\n📋 Summary:");
  for (const [status, count] of Object.entries(summary)) {
    console.log(`   ${status}: ${count}`);
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
