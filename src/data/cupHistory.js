// NHL-only championship era, winning calendar years 1927–2026.
// Original Ottawa Senators and Montreal Maroons keep separate franchise identities.
export const CUP_HISTORY_SOURCE='https://www.nhl.com/news/topic/nhl-awards/nhl-stanley-cup-champions-winners-complete-list-287705398';
const winners='OTS NYR BOS MTL MTL TOR NYR CHI TMM DET DET CHI BOS NYR BOS TOR DET MTL TOR MTL TOR TOR TOR DET TOR DET MTL DET DET MTL MTL MTL MTL MTL CHI TOR TOR TOR MTL MTL TOR MTL MTL BOS MTL BOS MTL PHI PHI MTL MTL MTL MTL NYI NYI NYI NYI EDM EDM MTL EDM EDM CGY EDM PIT PIT MTL NYR NJD COL DET DET DAL NJD COL DET NJD TBL NONE CAR ANA DET PIT CHI BOS LAK CHI LAK CHI PIT PIT WSH STL TBL TBL COL VGK FLA FLA CAR'.split(' ');
// Before 1927 the Cup was contested between leagues; the NHL credits these titles to today's franchises
// (Montreal's 1916 NHA Cup, Toronto's 1918 Arenas and 1922 St. Pats, Montreal 1924). Victoria (1925)
// and the Maroons (1926) belong to defunct clubs and are kept for completeness.
const EARLY=[[1916,'MTL'],[1918,'TOR'],[1920,'OTS'],[1921,'OTS'],[1922,'TOR'],[1923,'OTS'],[1924,'MTL'],[1925,'VIC'],[1926,'MTM']];
export const CUP_HISTORY=[...EARLY.map(([year,abbr])=>({year,abbr})),...winners.map((abbr,i)=>({year:1927+i,abbr}))].filter(r=>r.abbr!=='NONE');
