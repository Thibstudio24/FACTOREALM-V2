import fs from 'node:fs';
import { initDatabase } from '../src/server/db';
import { initializeCompanyInDb } from '../src/server/setup';

async function main() {
  const rawInput = fs.readFileSync(0, 'utf8');
  const payload = JSON.parse(rawInput);

  const ctx = initDatabase({
    dbPath: payload.dbPath,
    uploadDir: payload.uploadDir,
  });

  try {
    const existing = ctx.db.prepare('SELECT id, name FROM companies LIMIT 1').get() as
      | { id: string; name: string }
      | undefined;

    if (existing) {
      process.stdout.write(
        JSON.stringify({
          alreadyInitialized: true,
          companyId: existing.id,
          companyName: existing.name,
        }),
      );
      return;
    }

    const res = initializeCompanyInDb(ctx.db, {
      companyName: payload.companyName,
      legalForm: payload.legalForm,
      siret: payload.siret,
      vatNumber: payload.vatNumber,
      vatRegime: payload.vatRegime,
      address: payload.address,
      postalCode: payload.postalCode,
      city: payload.city,
      adminName: payload.adminName,
      adminEmail: payload.adminEmail,
      adminPassword: payload.adminPassword,
    });

    process.stdout.write(
      JSON.stringify({
        alreadyInitialized: false,
        ...res,
      }),
    );
  } finally {
    ctx.db.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
