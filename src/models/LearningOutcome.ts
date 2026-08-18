import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({ tableName: "LearningOutcome", timestamps: true })
export default class LearningOutcome extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_LearningOutcome: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare ID_Product?: number;

  @Column({ type: DataType.STRING, allowNull: false })
  declare ProductTitle: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare PredictedSalePrice: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare ActualAverageSalePrice: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare PredictedMarginPct: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare ActualMarginPct: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare PredictedSellThroughDays?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare ActualSellThroughDays?: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare UnitsPurchased: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare UnitsSold: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 })
  declare PriceErrorPct: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 })
  declare MarginErrorPct: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  declare RotationErrorPct?: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 50 })
  declare PredictionAccuracyScore: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 50 })
  declare ConfidenceAdjustment: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare Notes?: string;
}
