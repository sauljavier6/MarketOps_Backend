import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({ tableName: "ReplenishmentDecision", timestamps: true })
export default class ReplenishmentDecision extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_ReplenishmentDecision: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare ID_Product: number;

  @Column({ type: DataType.STRING, allowNull: false })
  declare ProductName: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare CurrentStock: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare UnitsSoldWindow: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare WindowDays: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare SeasonDaysRemaining?: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare AverageDailySales: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare DaysOfCover: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare RealMarginPct: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare RecommendedQuantity: number;

  @Column({ type: DataType.STRING, allowNull: false })
  declare Decision: "REORDER" | "HOLD" | "STOP" | "EXIT";

  @Column({ type: DataType.TEXT, allowNull: true })
  declare Reason?: string;
}
