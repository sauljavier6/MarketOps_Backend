import { calculateSupplierScore } from "./supplierDiscoveryService";
export function calculateTargetPurchaseCost(i:any){const non=Number(i.marketplaceFeePerUnit||0)+Number(i.outboundShippingPerUnit||0)+Number(i.packagingCostPerUnit||0);return Number(Math.max(0,Number(i.estimatedSalePrice||0)*.70-non).toFixed(2));}
export function buildInvestmentRecommendation(i:any){
 const target=calculateTargetPurchaseCost(i); const usable=Math.min(Number(i.availableCapital||0)*.55,Number(i.availableCapital||0)*.30);
 const offers=(i.offers||[]).map((o:any)=>({...o,...calculateSupplierScore(o,target,Math.max(Number(o.moq||1),1))})).sort((a:any,b:any)=>b.score-a.score||a.landedUnitCost-b.landedUnitCost);
 const best=offers[0]; if(!best)return {title:i.title,targetPurchaseCost:target,decision:"WATCH",score:Number(i.marketScore||0),reason:"Falta proveedor/cotización.",offers,recommendedQuantity:0,recommendedInvestment:0,estimatedProfitPerUnit:0};
 let qty=Math.floor(usable/best.landedUnitCost); if(qty>0&&qty<Number(best.moq||1)) qty=usable>=Number(best.moq||1)*best.landedUnitCost?Number(best.moq):0;
 if(i.seasonDaysRemaining!=null){if(i.seasonDaysRemaining<14)qty=Math.floor(qty*.35);else if(i.seasonDaysRemaining<30)qty=Math.floor(qty*.65);} if(qty>0&&qty<Number(best.moq||1))qty=0;
 const profit=Number((Number(i.estimatedSalePrice)-best.landedUnitCost-Number(i.marketplaceFeePerUnit||0)-Number(i.outboundShippingPerUnit||0)-Number(i.packagingCostPerUnit||0)).toFixed(2));
 const margin=Number(i.estimatedSalePrice)>0?profit/Number(i.estimatedSalePrice)*100:0; const total=Math.round(Number(i.marketScore||0)*.5+Number(best.score||0)*.25+Math.max(0,Math.min(100,margin*2.3))*.25);
 const decision=qty<=0||profit<=0?"SKIP":total>=82&&margin>=25?"BUY":total>=67&&margin>=18?"TEST":total>=52?"WATCH":"SKIP";
 const inv=Number((qty*best.landedUnitCost).toFixed(2));
 return {title:i.title,targetPurchaseCost:target,bestSupplier:{supplierName:best.supplierName,source:best.source,sourceUrl:best.sourceUrl,moq:best.moq,landedUnitCost:best.landedUnitCost,supplierScore:best.score,deliveryDays:best.deliveryDays},offers,estimatedSalePrice:Number(i.estimatedSalePrice),estimatedProfitPerUnit:profit,estimatedMarginPct:Number(margin.toFixed(2)),recommendedQuantity:qty,recommendedInvestment:inv,capitalRemainingAfterRecommendation:Number((Number(i.availableCapital)-inv).toFixed(2)),score:total,decision,reason:decision==="BUY"?"Mercado, proveedor y margen cumplen objetivos.":decision==="TEST"?"Tiene potencial; conviene una compra piloto.":decision==="WATCH"?"Necesita mejor costo o más señales.":"No cumple margen, capital o MOQ."};
}
