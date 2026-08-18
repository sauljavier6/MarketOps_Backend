import { AutoIncrement, Column, DataType, HasMany, Model, PrimaryKey, Table } from "sequelize-typescript";
import MarketplaceListing from "./MarketplaceListing";
import Stock from "./Stock";

@Table({ tableName: "Product", timestamps: true })
export default class Product extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_Product: number;
  @Column({ type: DataType.STRING, allowNull: false }) declare Description: string;
  @Column({ type: DataType.STRING, allowNull: false, unique: true }) declare Code: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare Brand?: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare Category?: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare ImageUrl?: string;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true }) declare TargetPurchasePrice?: number;
  @Column({ type: DataType.BOOLEAN, defaultValue: true }) declare State: boolean;
  @HasMany(() => Stock) Stock?: Stock[];
  @HasMany(() => MarketplaceListing) Listings?: MarketplaceListing[];
}
