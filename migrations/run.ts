/**
 * Migration Runner
 * Reads SQL files from the migrations/ directory and executes them
 * against the database specified in DATABASE_URL.
 *
 * Usage: npx ts-node migrations/run.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    // Create migrations tracking table
    await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // Get already-executed migrations
    const executed = await pool.query('SELECT name FROM _migrations ORDER BY id');
    const executedNames = new Set(executed.rows.map((r: any) => r.name));

    // Read migration files
    const migrationsDir = path.join(__dirname);
    const files = fs.readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        if (executedNames.has(file)) {
            console.log(`⏭️  Skipping (already executed): ${file}`);
            continue;
        }

        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        console.log(`🚀 Running migration: ${file}`);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`✅ Migration complete: ${file}`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ Migration failed: ${file}`, error);
            process.exit(1);
        } finally {
            client.release();
        }
    }

    await pool.end();
    console.log('\n🎉 All migrations complete!');
}

runMigrations().catch((err) => {
    console.error('Migration runner error:', err);
    process.exit(1);
});
