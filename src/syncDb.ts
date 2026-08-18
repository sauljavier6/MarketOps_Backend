import "reflect-metadata";
import "dotenv/config";
import { sequelize } from "./config/database";

async function run() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  console.log("✅ MarketOps schema synchronized");
  await sequelize.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
