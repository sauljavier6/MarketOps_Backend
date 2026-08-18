import { AutoIncrement, BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from "sequelize-typescript";
import CapitalAccount from "./CapitalAccount";

@Table({ tableName: "CapitalMovement", timestamps: true })
export default class CapitalMovement extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_CapitalMovement: number;
  @ForeignKey(() => CapitalAccount) @Column(DataType.INTEGER) declare ID_CapitalAccount: number;
  @BelongsTo(() => CapitalAccount) CapitalAccount?: CapitalAccount;
  @Column({ type: DataType.STRING, allowNull: false }) declare Type: "INITIAL" | "PURCHASE" | "SALE" | "FEE" | "REFUND" | "WITHDRAWAL" | "ADJUSTMENT";
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false }) declare Amount: number;
  @Column({ type: DataType.STRING, allowNull: true }) declare Reference?: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare Notes?: string;
}
