import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({ tableName: "DiscoveryRun", timestamps: true })
export default class DiscoveryRun extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_DiscoveryRun: number;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "MERCADOLIBRE" }) declare Source: string;
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "PENDING" }) declare Status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  @Column({ type: DataType.STRING, allowNull: true }) declare CategoryId?: string;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare TrendsFound: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) declare CandidatesCreated: number;
  @Column({ type: DataType.TEXT, allowNull: true }) declare ErrorMessage?: string;
  @Column({ type: DataType.DATE, allowNull: true }) declare StartedAt?: Date;
  @Column({ type: DataType.DATE, allowNull: true }) declare FinishedAt?: Date;
}
