import { prisma } from '@/lib/prisma';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Застосовує SQL міграцію з файлу
 */
async function applyMigration(migrationFile: string) {
  try {
    const migrationPath = join(process.cwd(), '..', 'database', 'migrations', migrationFile);
    const sql = readFileSync(migrationPath, 'utf-8');
    
    console.log(`Applying migration: ${migrationFile}`);
    console.log('SQL:', sql);
    
    await prisma.$executeRawUnsafe(sql);
    
    console.log(`✅ Migration ${migrationFile} applied successfully!`);
  } catch (error: any) {
    if (error.message?.includes('duplicate column') || 
        error.message?.includes('already exists')) {
      console.log(`⚠️  Column already exists in ${migrationFile}, skipping...`);
    } else {
      console.error(`❌ Error applying migration ${migrationFile}:`, error);
      throw error;
    }
  }
}

async function main() {
  try {
    // Застосовуємо міграцію для optimizedImages
    await applyMigration('add_optimized_images.sql');
    
    console.log('✅ All migrations applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
