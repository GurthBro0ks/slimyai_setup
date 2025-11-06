// lib/alert.js - Alert system for critical errors and warnings
const logger = require("./logger");

module.exports = {
  async criticalError(message, error, context = {}) {
    logger.critical(message, {
      error: error?.message || error,
      stack: error?.stack,
      ...context,
    });

    // Send to Discord webhook if configured
    if (process.env.ERROR_WEBHOOK_URL) {
      try {
        const fetch = (await import("node-fetch")).default;
        await fetch(process.env.ERROR_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [
              {
                title: "🚨 CRITICAL ERROR",
                description: message,
                color: 0xff0000, // Red
                fields: [
                  {
                    name: "Error",
                    value: `\`\`\`${(error?.message || error || "Unknown error").substring(0, 1000)}\`\`\``,
                    inline: false,
                  },
                  {
                    name: "Context",
                    value: `\`\`\`json\n${JSON.stringify(context, null, 2).substring(0, 1000)}\`\`\``,
                    inline: false,
                  },
                ],
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      } catch (webhookErr) {
        logger.error("Failed to send error webhook", {
          webhookErr: webhookErr.message,
        });
      }
    }
  },

  async warning(message, context = {}) {
    logger.warn(message, context);

    // Optionally send warnings to webhook if configured
    if (
      process.env.ERROR_WEBHOOK_URL &&
      process.env.WEBHOOK_INCLUDE_WARNINGS === "true"
    ) {
      try {
        const fetch = (await import("node-fetch")).default;
        await fetch(process.env.ERROR_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [
              {
                title: "⚠️ WARNING",
                description: message,
                color: 0xffa500, // Orange
                fields: [
                  {
                    name: "Context",
                    value: `\`\`\`json\n${JSON.stringify(context, null, 2).substring(0, 1000)}\`\`\``,
                    inline: false,
                  },
                ],
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      } catch (webhookErr) {
        logger.error("Failed to send warning webhook", {
          webhookErr: webhookErr.message,
        });
      }
    }
  },

  async info(message, context = {}) {
    logger.info(message, context);
  },
};
