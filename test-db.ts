import { db } from './server/db';
import { users } from './shared/schema';

async function testDatabaseConnection() {
  console.log("Testing database connection...");
  
  try {
    // Test if we can query the users table
    const result = await db.select().from(users).limit(5);
    console.log("Connection successful!");
    console.log("Users in database:", result.length);
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

testDatabaseConnection()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
