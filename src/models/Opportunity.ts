import { AutoIncrement, BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import Season from "./Season";

@Table({ tableName: "Opportunity", timestamps: true })
export default class Opportunity extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_Opportunity: number;
  @ForeignKey(() => Season) @Column({ type: DataType.INTEGER, allowNull: true }) declare ID_Season?: number;
  @BelongsTo(() => Season) Season?: Season;
  @Column({ type: DataType.STRING, allowNull: false }) declare Title: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare Marketplace?: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare MarketplaceItemId?: string;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false }) declare MarketPrice: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false }) declare TargetPurchasePrice: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }) declare EstimatedMarketplaceCost: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 50 }) declare DemandScore: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 50 }) declare CompetitionScore: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare Score: number;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "WATCH" }) declare Recommendation: "BUY" | "TEST" | "WATCH" | "SKIP";
}
