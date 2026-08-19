import "reflect-metadata";
import "dotenv/config";
import { sequelize } from "./config/database";

async function run() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  await sequelize.query(`
    ALTER TABLE "MarketplaceAccount"
      ALTER COLUMN "AccessTokenEncrypted" TYPE TEXT,
      ALTER COLUMN "RefreshTokenEncrypted" TYPE TEXT,
      ALTER COLUMN "Scope" TYPE TEXT,
      ALTER COLUMN "Nickname" TYPE TEXT;
  `);

  console.log("✅ MarketOps schema synchronized");
  console.log("✅ MarketplaceAccount OAuth columns forced to TEXT");
  await sequelize.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
