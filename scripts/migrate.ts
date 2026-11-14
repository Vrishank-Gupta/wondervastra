import "dotenv/config";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "../src/db";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("✓ Database is up to date");
process.exit(0);
