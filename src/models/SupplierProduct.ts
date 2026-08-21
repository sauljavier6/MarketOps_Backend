import { AutoIncrement, BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import Product from "./Product";

@Table({ tableName: "SupplierProduct", timestamps: true })
export default class SupplierProduct extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_SupplierProduct: number;
  @ForeignKey(() => Product) @Column({ type: DataType.INTEGER, allowNull: false }) declare ID_Product: number;
  @BelongsTo(() => Product) Product?: Product;
  @Column({ type: DataType.STRING, allowNull: false }) declare Provider: string;
  @Column({ type: DataType.STRING, allowNull: false }) declare ProviderProductId: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare SupplierSku?: string;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true }) declare CurrentSupplierPrice?: number;
  @Column({ type: DataType.INTEGER, allowNull: true }) declare CurrentSupplierStock?: number;
  @Column({ type: DataType.STRING, allowNull: true }) declare Currency?: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare ImageUrl?: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false }) declare DropshippingEnabled: boolean;
  @Column({ type: DataType.DATE, allowNull: true }) declare LastSyncedAt?: Date;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) declare State: boolean;
}
