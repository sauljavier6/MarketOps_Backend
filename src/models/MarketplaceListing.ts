import { AutoIncrement, BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import Product from "./Product";

@Table({ tableName: "MarketplaceListing", timestamps: true })
export default class MarketplaceListing extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_Listing: number;
  @ForeignKey(() => Product) @Column(DataType.INTEGER) declare ID_Product: number;
  @BelongsTo(() => Product) Product?: Product;
  @Column({ type: DataType.STRING, allowNull: false }) declare Marketplace: "MERCADOLIBRE";
  @Column({ type: DataType.STRING, allowNull: true }) declare ExternalId?: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "DRAFT" }) declare Status: "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED";
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false }) declare Price: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare AvailableQuantity: number;
  @Column({ type: DataType.STRING, allowNull: true }) declare Permalink?: string;
}
