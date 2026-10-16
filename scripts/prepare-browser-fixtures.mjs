import {fileURLToPath} from 'node:url';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import * as L from '../src/engine/league.js';
import {startDeadline} from '../src/engine/market.js';
import {simDraftToUser} from '../src/engine/draft.js';
const dir=process.env.NHL_QA_DIR || fileURLToPath(new URL('../tmp/browser-qa',import.meta.url));mkdirSync(dir,{recursive:true});
let lg=L.createLeague({seed:881012,userAbbr:'EDM'});L.startRegularSeason(lg);lg.day=lg.deadlineDay;startDeadline(lg);writeFileSync(dir+'/deadline-save.txt',L.serializeLeague(lg));
lg=L.deserializeLeague(readFileSync(dir+'/draft-save.txt','utf8'));simDraftToUser(lg,{all:true});L.completeDraft(lg);writeFileSync(dir+'/resign-save.txt',L.serializeLeague(lg));L.goToFreeAgency(lg);writeFileSync(dir+'/fa-save.txt',L.serializeLeague(lg));
console.log('Prepared active deadline, re-signing and free-agency browser fixtures from a fully simulated season.');
