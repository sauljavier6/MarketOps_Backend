import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";
@Table({ tableName: "RadarCandidate", timestamps: true })
export default class RadarCandidate extends Model {
 @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_RadarCandidate:number;
 @Column({type:DataType.STRING,allowNull:false}) declare Title:string;
 @Column({type:DataType.STRING,allowNull:true}) declare Season?:string;
 @Column({type:DataType.DECIMAL(10,2),allowNull:false}) declare EstimatedSalePrice:number;
 @Column({type:DataType.DECIMAL(10,2),allowNull:false,defaultValue:0}) declare EstimatedMarketplaceFee:number;
 @Column({type:DataType.DECIMAL(10,2),allowNull:false,defaultValue:0}) declare EstimatedShippingCost:number;
 @Column({type:DataType.DECIMAL(10,2),allowNull:false,defaultValue:0}) declare PackagingCost:number;
 @Column({type:DataType.INTEGER,allowNull:false,defaultValue:50}) declare DemandScore:number;
 @Column({type:DataType.INTEGER,allowNull:false,defaultValue:50}) declare CompetitionScore:number;
 @Column({type:DataType.INTEGER,allowNull:false,defaultValue:50}) declare SeasonalScore:number;
 @Column({type:DataType.INTEGER,allowNull:false,defaultValue:50}) declare TrendScore:number;
 @Column({type:DataType.INTEGER,allowNull:false,defaultValue:0}) declare MarketScore:number;
 @Column({type:DataType.STRING,allowNull:false,defaultValue:"DISCOVERED"}) declare Status:string;
}
