import "reflect-metadata";
import "dotenv/config";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { sequelize } from "./config/database";
import { apiRouter } from "./routes";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.get("/api/health", (_req, res) => res.json({ success: true, service: "MarketOps", version: "0.2.0" }));
app.use("/api", apiRouter);

const port = Number(process.env.PORT || 4580);

async function bootstrap() {
  try {
    await sequelize.authenticate();
    console.log("✅ PostgreSQL connection OK");
  } catch (error) {
    console.warn("⚠️ Database not connected yet. API can still start for MVP endpoints.");
  }

  app.listen(port, () => console.log(`🚀 MarketOps API running on http://localhost:${port}`));
}

bootstrap();
