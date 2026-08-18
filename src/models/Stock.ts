import { BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import Product from "./Product";

@Table({ tableName: "Stock", timestamps: true })
export default class Stock extends Model {
  @PrimaryKey @ForeignKey(() => Product) @Column(DataType.INTEGER) declare ID_Product: number;
  @BelongsTo(() => Product) Product?: Product;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare Amount: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }) declare AveragePurchasePrice: number;
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }) declare SalePrice: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare Reserved: number;
}
