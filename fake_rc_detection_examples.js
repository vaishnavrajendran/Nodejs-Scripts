/**
 * Example: Fake RC Detection Integration
 * 
 * This file demonstrates how to integrate the fake RC detection system
 * into your application workflow.
 */

const { detectFakeRC, flagAsFake } = require('./fake_rc_detector_final');
const fs = require('fs');
const path = require('path');

// ============================================================================
// Example 1: Simple Detection
// ============================================================================

async function example1_simpleDetection() {
    console.log('\n=== Example 1: Simple Detection ===\n');
    
    const imagePath = 'New.png';
    const result = await detectFakeRC(imagePath);
    
    console.log(`Image: ${imagePath}`);
    console.log(`Is Fake: ${result.isFake}`);
    console.log(`Score: ${result.score}`);
    console.log(`Confidence: ${result.confidence}%`);
}

// ============================================================================
// Example 2: Batch Processing
// ============================================================================

async function example2_batchProcessing() {
    console.log('\n=== Example 2: Batch Processing ===\n');
    
    const images = ['New.png', 'realog1.jpeg'];
    const results = [];
    
    for (const imagePath of images) {
        try {
            const result = await detectFakeRC(imagePath);
            results.push({
                filename: path.basename(imagePath),
                ...result
            });
        } catch (error) {
            console.error(`Error processing ${imagePath}:`, error.message);
        }
    }
    
    // Print summary
    console.log('Batch Processing Results:');
    console.log('─'.repeat(70));
    for (const result of results) {
        console.log(`${result.filename.padEnd(20)} | ${result.isFake ? 'FAKE' : 'REAL'} | Score: ${result.score}`);
    }
}

// ============================================================================
// Example 3: Custom Threshold
// ============================================================================

async function example3_customThreshold() {
    console.log('\n=== Example 3: Custom Threshold ===\n');
    
    const imagePath = 'New.png';
    const thresholds = [500, 550, 600, 650];
    
    console.log(`Testing image: ${imagePath}`);
    console.log('─'.repeat(70));
    
    for (const threshold of thresholds) {
        const result = await detectFakeRC(imagePath, { threshold });
        console.log(`Threshold ${threshold}: ${result.isFake ? 'FAKE' : 'REAL'} (score: ${result.score})`);
    }
}

// ============================================================================
// Example 4: Integration with File Upload Handler
// ============================================================================

async function example4_uploadHandler(uploadedFilePath) {
    console.log('\n=== Example 4: Upload Handler Integration ===\n');
    
    try {
        // Step 1: Validate file exists
        if (!fs.existsSync(uploadedFilePath)) {
            throw new Error('Uploaded file not found');
        }
        
        // Step 2: Run fake detection
        console.log(`Checking uploaded file: ${uploadedFilePath}`);
        const result = await detectFakeRC(uploadedFilePath);
        
        // Step 3: Handle result
        if (result.isFake) {
            console.log('⚠️  Fake RC detected!');
            
            // Flag the file
            flagAsFake(uploadedFilePath, result);
            
            // Move to quarantine folder
            const quarantineDir = path.join(__dirname, 'quarantine');
            if (!fs.existsSync(quarantineDir)) {
                fs.mkdirSync(quarantineDir);
            }
            
            const quarantinePath = path.join(quarantineDir, path.basename(uploadedFilePath));
            // fs.renameSync(uploadedFilePath, quarantinePath);
            console.log(`Would move to: ${quarantinePath}`);
            
            // Return rejection response
            return {
                success: false,
                reason: 'Fake RC detected',
                score: result.score,
                confidence: result.confidence
            };
        } else {
            console.log('✅ RC appears to be valid');
            
            // Continue with normal processing
            return {
                success: true,
                message: 'RC validation passed'
            };
        }
        
    } catch (error) {
        console.error('Error in upload handler:', error.message);
        return {
            success: false,
            reason: 'Validation error',
            error: error.message
        };
    }
}

// ============================================================================
// Example 5: API Endpoint Integration (Express.js style)
// ============================================================================

async function example5_apiEndpoint() {
    console.log('\n=== Example 5: API Endpoint Integration ===\n');
    
    // Simulated Express.js endpoint
    const simulateEndpoint = async (req, res) => {
        try {
            // In real Express.js, you'd use multer or similar for file uploads
            const uploadedFile = req.file; // { path: '/tmp/upload_xyz.jpg' }
            
            if (!uploadedFile) {
                return res.status(400).json({
                    error: 'No file uploaded'
                });
            }
            
            // Run detection
            const result = await detectFakeRC(uploadedFile.path);
            
            if (result.isFake) {
                // Delete the fake file
                // fs.unlinkSync(uploadedFile.path);
                
                return res.status(400).json({
                    error: 'Fake RC detected',
                    details: {
                        score: result.score,
                        confidence: result.confidence,
                        threshold: result.threshold
                    }
                });
            }
            
            // Process valid RC
            return res.status(200).json({
                success: true,
                message: 'RC validated successfully',
                filename: uploadedFile.filename
            });
            
        } catch (error) {
            return res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        }
    };
    
    // Simulate request
    const mockReq = {
        file: {
            path: 'New.png',
            filename: 'New.png'
        }
    };
    
    const mockRes = {
        status: (code) => ({
            json: (data) => {
                console.log(`Response Status: ${code}`);
                console.log('Response Body:', JSON.stringify(data, null, 2));
            }
        })
    };
    
    await simulateEndpoint(mockReq, mockRes);
}

// ============================================================================
// Example 6: Database Integration
// ============================================================================

async function example6_databaseIntegration() {
    console.log('\n=== Example 6: Database Integration ===\n');
    
    // Simulated database operations
    const db = {
        updateRC: async (rcId, data) => {
            console.log(`[DB] Updating RC ${rcId}:`, data);
            return true;
        },
        logAudit: async (event) => {
            console.log(`[AUDIT] ${event.action}:`, event);
            return true;
        }
    };
    
    const rcId = 'RC123456';
    const imagePath = 'New.png';
    
    try {
        const result = await detectFakeRC(imagePath);
        
        if (result.isFake) {
            // Update database
            await db.updateRC(rcId, {
                status: 'FLAGGED_AS_FAKE',
                fakeDetectionScore: result.score,
                fakeDetectionConfidence: result.confidence,
                flaggedAt: new Date().toISOString()
            });
            
            // Log audit trail
            await db.logAudit({
                action: 'FAKE_RC_DETECTED',
                rcId: rcId,
                score: result.score,
                confidence: result.confidence,
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ RC ${rcId} flagged as fake in database`);
        } else {
            await db.updateRC(rcId, {
                status: 'VALIDATED',
                validatedAt: new Date().toISOString()
            });
            
            console.log(`✅ RC ${rcId} marked as validated in database`);
        }
        
    } catch (error) {
        console.error('Database integration error:', error.message);
    }
}

// ============================================================================
// Example 7: Monitoring and Alerts
// ============================================================================

async function example7_monitoringAlerts() {
    console.log('\n=== Example 7: Monitoring and Alerts ===\n');
    
    const imagePath = 'New.png';
    const result = await detectFakeRC(imagePath);
    
    if (result.isFake) {
        // Send alert (simulated)
        const alert = {
            type: 'FAKE_RC_DETECTED',
            severity: 'HIGH',
            timestamp: new Date().toISOString(),
            details: {
                filename: path.basename(imagePath),
                score: result.score,
                confidence: result.confidence,
                matchPosition: result.match
            }
        };
        
        console.log('🚨 ALERT:', JSON.stringify(alert, null, 2));
        
        // In production, you might:
        // - Send email notification
        // - Post to Slack/Teams
        // - Trigger PagerDuty
        // - Log to monitoring system (DataDog, New Relic, etc.)
    }
}

// ============================================================================
// Run Examples
// ============================================================================

async function runAllExamples() {
    try {
        await example1_simpleDetection();
        await example2_batchProcessing();
        await example3_customThreshold();
        await example4_uploadHandler('New.png');
        await example5_apiEndpoint();
        await example6_databaseIntegration();
        await example7_monitoringAlerts();
        
        console.log('\n✅ All examples completed successfully!\n');
    } catch (error) {
        console.error('Error running examples:', error);
    }
}

// Run if executed directly
if (require.main === module) {
    runAllExamples();
}

module.exports = {
    example1_simpleDetection,
    example2_batchProcessing,
    example3_customThreshold,
    example4_uploadHandler,
    example5_apiEndpoint,
    example6_databaseIntegration,
    example7_monitoringAlerts
};
