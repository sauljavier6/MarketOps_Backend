import { AutoIncrement, BelongsTo, Column, DataType, ForeignKey, HasMany, Model, PrimaryKey, Table } from "sequelize-typescript";
import PurchaseItem from "./PurchaseItem";
import Supplier from "./Supplier";

@Table({ tableName: "Purchase", timestamps: true })
export default class Purchase extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_Purchase: number;
  @ForeignKey(() => Supplier) @Column({ type: DataType.INTEGER, allowNull: false }) declare ID_Supplier: number;
  @BelongsTo(() => Supplier) Supplier?: Supplier;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "DRAFT" }) declare Status: "DRAFT" | "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }) declare MerchandiseTotal: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }) declare ShippingCost: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }) declare Total: number;
  @Column({ type: DataType.DATEONLY, allowNull: true }) declare ExpectedDate?: string;
  @HasMany(() => PurchaseItem) Items?: PurchaseItem[];
}
