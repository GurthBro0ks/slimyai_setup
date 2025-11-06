/**
 * Simple DB connectivity test used by automation scripts.
 */
const db = require("../lib/database");

(async () => {
  try {
    await db.testConnection();
    console.log("[db-test] Database connection OK");
    process.exit(0);
  } catch (err) {
    console.error("[db-test] Database connection failed:", err.message || err);
    process.exit(1);
  } finally {
    try {
      await db.close();
    } catch {
      // Ignore close errors
    }
  }
})();
