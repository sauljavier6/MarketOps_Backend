import { AutoIncrement, BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import Product from "./Product";
import Sale from "./Sale";

@Table({ tableName: "SaleItem", timestamps: true })
export default class SaleItem extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_SaleItem: number;
  @ForeignKey(() => Sale) @Column(DataType.INTEGER) declare ID_Sale: number;
  @BelongsTo(() => Sale) Sale?: Sale;
  @ForeignKey(() => Product) @Column(DataType.INTEGER) declare ID_Product: number;
  @BelongsTo(() => Product) Product?: Product;
  @Column({ type: DataType.INTEGER, allowNull: false }) declare Quantity: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false }) declare UnitPrice: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false }) declare UnitCost: number;
}
