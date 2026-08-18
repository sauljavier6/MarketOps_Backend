import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";
@Table({ tableName: "SupplierOffer", timestamps: true })
export default class SupplierOffer extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_SupplierOffer:number;
  @Column({type:DataType.STRING,allowNull:false}) declare ProductQuery:string;
  @Column({type:DataType.STRING,allowNull:false}) declare SupplierName:string;
  @Column({type:DataType.STRING,allowNull:true}) declare Source?:string;
  @Column({type:DataType.STRING,allowNull:true}) declare SourceUrl?:string;
  @Column({type:DataType.DECIMAL(10,2),allowNull:false}) declare UnitPrice:number;
  @Column({type:DataType.INTEGER,allowNull:false,defaultValue:1}) declare MOQ:number;
  @Column({type:DataType.DECIMAL(10,2),allowNull:false,defaultValue:0}) declare ShippingCost:number;
  @Column({type:DataType.DECIMAL(10,2),allowNull:false,defaultValue:0}) declare ImportCost:number;
  @Column({type:DataType.INTEGER,allowNull:true}) declare DeliveryDays?:number;
  @Column({type:DataType.INTEGER,allowNull:false,defaultValue:50}) declare ReliabilityScore:number;
  @Column({type:DataType.BOOLEAN,allowNull:false,defaultValue:true}) declare State:boolean;
}
