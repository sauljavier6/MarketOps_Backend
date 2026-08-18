import { AutoIncrement, Column, DataType, HasMany, Model, PrimaryKey, Table } from "sequelize-typescript";
import Purchase from "./Purchase";

@Table({ tableName: "Supplier", timestamps: true })
export default class Supplier extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_Supplier: number;
  @Column({ type: DataType.STRING, allowNull: false }) declare Name: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare Contact?: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare Phone?: string;
  @Column({ type: DataType.STRING, allowNull: true }) declare Website?: string;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 50 }) declare ReliabilityScore: number;
  @Column({ type: DataType.BOOLEAN, defaultValue: true }) declare State: boolean;
  @HasMany(() => Purchase) Purchases?: Purchase[];
}
