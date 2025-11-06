#!/usr/bin/env node
"use strict";

const database = require("./src/lib/database");

async function testDatabase() {
  console.log("Testing database connection and basic operations...");

  try {
    // Test initialization
    console.log("1. Initializing database...");
    const initialized = await database.initialize();
    if (!initialized) {
      console.error("❌ Database initialization failed");
      return;
    }
    console.log("✅ Database initialized successfully");

    // Test user creation
    console.log("2. Testing user creation...");
    const testUser = await database.findOrCreateUser({
      id: "123456789012345678",
      username: "testuser",
      global_name: "Test User",
      avatar: null
    });
    console.log("✅ User created/found:", testUser.username);

    // Test guild creation
    console.log("3. Testing guild creation...");
    const testGuild = await database.findOrCreateGuild({
      id: "987654321098765432",
      name: "Test Guild"
    });
    console.log("✅ Guild created/found:", testGuild.name);

    // Test user-guild relationship
    console.log("4. Testing user-guild relationship...");
    await database.addUserToGuild(testUser.id, testGuild.id, ["admin"]);
    const userGuilds = await database.getUserGuilds(testUser.id);
    console.log("✅ User added to guild, relationships:", userGuilds.length);

    // Test session creation
    console.log("5. Testing session creation...");
    const expiresAt = Date.now() + 3600000; // 1 hour from now
    const session = await database.createSession(testUser.id, "test-token-123", expiresAt);
    console.log("✅ Session created:", session.id);

    // Test chat message creation
    console.log("6. Testing chat message creation...");
    const message = await database.createChatMessage({
      userId: testUser.id,
      guildId: testGuild.id,
      text: "Hello, this is a test message!",
      adminOnly: false
    });
    console.log("✅ Chat message created:", message.id);

    // Test conversation creation
    console.log("7. Testing conversation creation...");
    const conversation = await database.createConversation(testUser.id, "Test Conversation");
    console.log("✅ Conversation created:", conversation.id);

    // Test stats recording
    console.log("8. Testing stats recording...");
    const stat = await database.recordStat({
      userId: testUser.id,
      guildId: testGuild.id,
      type: "message_sent",
      value: { count: 1 }
    });
    console.log("✅ Stat recorded:", stat.id);

    // Test chat message retrieval
    console.log("9. Testing chat message retrieval...");
    const messages = await database.getChatMessages(testGuild.id, 10);
    console.log("✅ Retrieved", messages.length, "messages");

    console.log("\n🎉 All database tests passed successfully!");

  } catch (error) {
    console.error("❌ Database test failed:", error);
  } finally {
    // Close the database connection
    await database.close();
  }
}

// Run the test
testDatabase().catch(console.error);
