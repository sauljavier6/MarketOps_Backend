import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({ tableName: "MarketplaceAccount", timestamps: true })
export default class MarketplaceAccount extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_MarketplaceAccount: number;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "MERCADOLIBRE" })
  declare Marketplace: "MERCADOLIBRE";

  // Mercado Libre user IDs can exceed Int32, so we store them as BIGINT/string-safe values.
  @Column({ type: DataType.BIGINT, allowNull: false, unique: true })
  declare ExternalUserId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare AccessTokenEncrypted: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare RefreshTokenEncrypted: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare AccessTokenExpiresAt: Date;

  @Column({ type: DataType.STRING, allowNull: true })
  declare Scope?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare Nickname?: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare State: boolean;
}
