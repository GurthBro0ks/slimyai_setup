require("dotenv").config();
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

async function testGoogleAuth() {
  console.log("🔍 Testing Google Service Account Authentication\n");

  try {
    // Load credentials
    const credPath = path.resolve(__dirname, "google-service-account.json");
    console.log(`📄 Loading credentials from: ${credPath}`);

    if (!fs.existsSync(credPath)) {
      console.error("❌ Credentials file not found!");
      return;
    }

    const credentials = JSON.parse(fs.readFileSync(credPath, "utf8"));
    console.log(`✅ Credentials loaded`);
    console.log(`   Service Account: ${credentials.client_email}`);
    console.log(`   Project: ${credentials.project_id}\n`);

    // Create JWT client
    console.log("🔐 Creating JWT client...");
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });

    // Get access token
    console.log("🎫 Requesting access token...");
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (token.token) {
      console.log("✅ SUCCESS! Access token obtained");
      console.log(`   Token: ${token.token.substring(0, 20)}...`);
      console.log(`   Token length: ${token.token.length} characters\n`);

      // Test Sheets API
      console.log("📊 Testing Sheets API access...");
      const sheets = google.sheets({ version: "v4", auth });

      // Try to create a test spreadsheet
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: "Test Sheet - DELETE ME",
          },
        },
      });

      console.log("✅ Sheets API working!");
      console.log(
        `   Created test spreadsheet: ${response.data.spreadsheetId}`,
      );
      console.log(
        `   URL: https://docs.google.com/spreadsheets/d/${response.data.spreadsheetId}`,
      );

      // Clean up - delete the test sheet
      console.log("\n🗑️  Cleaning up test sheet...");
      const drive = google.drive({ version: "v3", auth });
      await drive.files.delete({ fileId: response.data.spreadsheetId });
      console.log("✅ Test sheet deleted\n");

      console.log("✅ ALL TESTS PASSED - Credentials are valid!");
    } else {
      console.error("❌ No token received");
    }
  } catch (error) {
    console.error("\n❌ ERROR OCCURRED:");
    console.error(`   Type: ${error.name || "Unknown"}`);
    console.error(`   Message: ${error.message}`);

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }

    if (error.stack) {
      console.error("\n📋 Stack trace:");
      console.error(error.stack);
    }

    console.error("\n💡 Common causes:");
    console.error("   1. Service account key has been regenerated/rotated");
    console.error("   2. Service account has been deleted or disabled");
    console.error("   3. Clock skew (system time incorrect)");
    console.error("   4. Malformed private key in credentials file");
    console.error("   5. API not enabled in Google Cloud Console");
  }
}

testGoogleAuth();
