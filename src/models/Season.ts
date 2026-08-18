import { AutoIncrement, Column, DataType, HasMany, Model, PrimaryKey, Table } from "sequelize-typescript";
import Opportunity from "./Opportunity";

@Table({ tableName: "Season", timestamps: true })
export default class Season extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_Season: number;
  @Column({ type: DataType.STRING, allowNull: false }) declare Name: string;
  @Column({ type: DataType.DATEONLY, allowNull: false }) declare StartDate: string;
  @Column({ type: DataType.DATEONLY, allowNull: false }) declare EndDate: string;
  @Column({ type: DataType.BOOLEAN, defaultValue: true }) declare State: boolean;
  @HasMany(() => Opportunity) Opportunities?: Opportunity[];
}
