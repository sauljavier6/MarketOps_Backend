import { AutoIncrement, BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import Product from "./Product";

@Table({ tableName: "InventoryMovement", timestamps: true })
export default class InventoryMovement extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_InventoryMovement: number;
  @ForeignKey(() => Product) @Column(DataType.INTEGER) declare ID_Product: number;
  @BelongsTo(() => Product) Product?: Product;
  @Column({ type: DataType.STRING, allowNull: false }) declare Type: "PURCHASE" | "SALE" | "RETURN" | "ADJUSTMENT";
  @Column({ type: DataType.INTEGER, allowNull: false }) declare Quantity: number;
  @Column({ type: DataType.STRING, allowNull: true }) declare Reference?: string;
}
