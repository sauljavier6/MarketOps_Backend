import { AutoIncrement, BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import Product from "./Product";
import Purchase from "./Purchase";

@Table({ tableName: "PurchaseItem", timestamps: true })
export default class PurchaseItem extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_PurchaseItem: number;
  @ForeignKey(() => Purchase) @Column(DataType.INTEGER) declare ID_Purchase: number;
  @BelongsTo(() => Purchase) Purchase?: Purchase;
  @ForeignKey(() => Product) @Column(DataType.INTEGER) declare ID_Product: number;
  @BelongsTo(() => Product) Product?: Product;
  @Column({ type: DataType.INTEGER, allowNull: false }) declare Quantity: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare ReceivedQuantity: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false }) declare UnitCost: number;
}
