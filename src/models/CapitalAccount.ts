import { AutoIncrement, Column, DataType, HasMany, Model, PrimaryKey, Table } from "sequelize-typescript";
import CapitalMovement from "./CapitalMovement";

@Table({ tableName: "CapitalAccount", timestamps: true })
export default class CapitalAccount extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_CapitalAccount: number;
  @Column({ type: DataType.STRING, allowNull: false }) declare Name: string;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }) declare InitialCapital: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }) declare CurrentCash: number;
  @HasMany(() => CapitalMovement) Movements?: CapitalMovement[];
}
