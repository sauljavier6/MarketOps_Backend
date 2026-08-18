import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({ tableName: "MarketSnapshot", timestamps: true })
export default class MarketSnapshot extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_MarketSnapshot: number;
  @Column({ type: DataType.STRING, allowNull: false }) declare Source: string;
  @Column({ type: DataType.STRING, allowNull: false }) declare Keyword: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare CategoryId?: string;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare ActiveListings: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true }) declare MinPrice?: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true }) declare MedianPrice?: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true }) declare MaxPrice?: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 50 }) declare CompetitionScore: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 50 }) declare DemandScore: number;
  @Column({ type: DataType.JSONB, allowNull: true }) declare RawSummary?: object;
}
