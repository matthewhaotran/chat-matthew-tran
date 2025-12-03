const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
const { Client } = require("pg");

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    console.error(
      "SUPABASE_DB_URL is not set. Make sure it exists in .env.local before running migrations."
    );
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, "..", "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found in db/migrations.");
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      console.log(`Running migration: ${file}`);
      await client.query(sql);
    }
    console.log("Migrations completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
