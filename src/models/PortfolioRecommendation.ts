import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({ tableName: "PortfolioRecommendation", timestamps: true })
export default class PortfolioRecommendation extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_PortfolioRecommendation: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false }) declare AvailableCapital: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false }) declare RecommendedInvestment: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false }) declare ReserveCapital: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) declare ProductCount: number;
  @Column({ type: DataType.STRING, allowNull: false }) declare RiskLevel: "LOW" | "MEDIUM" | "HIGH";
  @Column({ type: DataType.JSONB, allowNull: false }) declare Allocation: object;
}
