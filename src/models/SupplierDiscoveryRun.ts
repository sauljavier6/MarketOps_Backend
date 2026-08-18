import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({ tableName: "SupplierDiscoveryRun", timestamps: true })
export default class SupplierDiscoveryRun extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_SupplierDiscoveryRun: number;
  @Column({ type: DataType.STRING, allowNull: false }) declare ProductQuery: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "BRAVE_SEARCH" }) declare Provider: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "RUNNING" }) declare Status: "RUNNING" | "COMPLETED" | "FAILED";
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare LeadsFound: number;
  @Column({ type: DataType.TEXT, allowNull: true }) declare ErrorMessage?: string;
  @Column({ type: DataType.DATE, allowNull: true }) declare StartedAt?: Date;
  @Column({ type: DataType.DATE, allowNull: true }) declare FinishedAt?: Date;
}
