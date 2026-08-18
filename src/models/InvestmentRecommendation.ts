import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";
@Table({ tableName: "InvestmentRecommendation", timestamps: true })
export default class InvestmentRecommendation extends Model {
 @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare ID_InvestmentRecommendation:number;
 @Column({type:DataType.STRING,allowNull:false}) declare ProductTitle:string;
 @Column({type:DataType.STRING,allowNull:true}) declare SupplierName?:string;
 @Column({type:DataType.DECIMAL(10,2),allowNull:false}) declare UnitLandedCost:number;
 @Column({type:DataType.DECIMAL(10,2),allowNull:false}) declare EstimatedSalePrice:number;
 @Column({type:DataType.DECIMAL(10,2),allowNull:false}) declare EstimatedProfitPerUnit:number;
 @Column({type:DataType.INTEGER,allowNull:false}) declare RecommendedQuantity:number;
 @Column({type:DataType.DECIMAL(12,2),allowNull:false}) declare RecommendedInvestment:number;
 @Column({type:DataType.INTEGER,allowNull:false}) declare Score:number;
 @Column({type:DataType.STRING,allowNull:false}) declare Decision:string;
 @Column({type:DataType.TEXT,allowNull:true}) declare Reason?:string;
}
