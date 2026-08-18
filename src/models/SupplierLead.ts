import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({ tableName: "SupplierLead", timestamps: true })
export default class SupplierLead extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_SupplierLead: number;

  @Column({ type: DataType.STRING, allowNull: false })
  declare ProductQuery: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare Name: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare Domain: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare Url: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare Snippet?: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "WEB_SEARCH" })
  declare Source: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 50 })
  declare LeadScore: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  declare PriceHint?: number;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "UNVERIFIED" })
  declare VerificationStatus: "UNVERIFIED" | "REVIEWED" | "QUOTED" | "REJECTED";

  @Column({ type: DataType.TEXT, allowNull: true })
  declare Notes?: string;
}
