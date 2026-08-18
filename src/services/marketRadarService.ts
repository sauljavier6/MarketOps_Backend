export function calculateMarketScore(i:any){const c=100-Number(i.competitionScore||0);return Math.max(0,Math.min(100,Math.round(Number(i.demandScore||0)*.35+c*.20+Number(i.seasonalScore||0)*.25+Number(i.trendScore||0)*.20)));}
export function getCandidateStatus(score:number){return score>=78?"SOURCING":score>=58?"DISCOVERED":"REJECTED";}
