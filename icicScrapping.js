const axios = require("axios");

async function searchVehicles(vehicleNumbers) {
  const startTime = performance.now();
  let completedCount = 0;

  // Create an array to store all promises for timing purposes
  const allPromises = [];

  // Process each vehicle number
  for (const vehicleNumber of vehicleNumbers) {
    // Create a promise for this vehicle search
    const promise = axios
      .get(`http://localhost:3001/api/search`, {
        params: { vehicleNumber },
      })
      .then((response) => {
        // Display result as soon as it's available
        console.log(`✅ Result for ${vehicleNumber}:`, response.data);
        completedCount++;
        console.log(
          `Progress: ${completedCount}/${vehicleNumbers.length} completed`
        );
        return { vehicleNumber, data: response.data };
      })
      .catch((error) => {
        // Display error as soon as it occurs
        console.error(`❌ Error for ${vehicleNumber}: ${error.message}`);
        completedCount++;
        console.log(
          `Progress: ${completedCount}/${vehicleNumbers.length} completed`
        );
        return { vehicleNumber, error: error.message };
      });

    // Add to our collection of all promises
    allPromises.push(promise);
  }

  // Wait for all requests to complete for timing purposes
  await Promise.all(allPromises);

  const endTime = performance.now();
  const totalTimeInSeconds = ((endTime - startTime) / 1000).toFixed(2);
  console.log(`\n⏱️ Total time taken: ${totalTimeInSeconds} seconds`);
}

// Example usage
const vehicles = [
  "KA05NE5157",
  // "KL31J5934",
  "TN09AX1234",
  "MH12DE3456",
  "TN09AX1234",
  "MH12DE3456",
  "AP16BM5678",
  "MH12DE3456",
  "AP16BM5678",
];
searchVehicles(vehicles);

// #!/bin/bash
// # Script to rebuild and restart the Docker container

// echo "Stopping any running containers..."
// docker-compose down

// echo "Rebuilding the Docker image with no cache..."
// docker-compose build --no-cache

// echo "Starting the container..."
// docker-compose up -d

// echo "Container logs (press Ctrl+C to exit):"
// docker-compose logs -f

// Patch for axios to disable brotli compression
// import axios from 'axios';

// // Override the default headers to avoid brotli compression
// axios.defaults.headers.common['Accept-Encoding'] = 'gzip, deflate';

// export default axios;
