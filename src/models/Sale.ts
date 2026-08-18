import { AutoIncrement, Column, DataType, HasMany, Model, PrimaryKey, Table } from "sequelize-typescript";
import SaleItem from "./SaleItem";

@Table({ tableName: "Sale", timestamps: true })
export default class Sale extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_Sale: number;
  @Column({ type: DataType.STRING, allowNull: false }) declare Channel: "MERCADOLIBRE" | "MANUAL";
  @Column({ type: DataType.STRING, allowNull: true }) declare ExternalOrderId?: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "PAID" }) declare Status: string;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false }) declare GrossAmount: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }) declare MarketplaceFees: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }) declare ShippingCost: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false }) declare NetAmount: number;
  @HasMany(() => SaleItem) Items?: SaleItem[];
}
