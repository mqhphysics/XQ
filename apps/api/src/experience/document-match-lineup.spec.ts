import assert from 'node:assert/strict'
import test from 'node:test'
import { documentMatchLineup } from './document-match-lineup'
const context={matchId:'m',teamId:'t',tournamentId:'cup'}
const entries=Array.from({length:10},(_,i)=>({playerProfileId:'p'+i,displayName:'姓名'+i,shirtNumber:String(i+1),playerProfile:{position:null,avatarUrl:null}}))
const labels=['GK','DF','DF','DF','MF','MF','FW','FW']
const evidence={...context,lineup:{formation:'3-2-2',captainPlayerId:'p4',slots:labels.map((label,i)=>({label,x:50,y:label==='GK'?90:label==='DF'?68:label==='MF'?44:20,playerId:i===7?null:'p'+i,...(i===7?{identityPending:true,shirtNumber:'24'}:{})}))}}
test('signed sheet holds eight players and one goalkeeper, with an unbound shirt rather than a fabricated player',()=>{const r=documentMatchLineup(entries,evidence,context)!;assert.equal(r.players.filter(p=>p.starter).length,8);assert.equal(r.players.filter(p=>p.starter&&p.position==='GOALKEEPER').length,1);assert.deepEqual(r.players[0]!.pitchPosition,{x:50,y:10});assert.equal(r.players[7]!.displayName,'24号');assert.equal(r.players[7]!.identityPending,true);assert(r.players[7]!.id.startsWith('pending:'));assert(r.players.every(p=>p.minutesPlayed===null));assert.equal(r.captainPlayerId,'p4');assert.equal(r.confirmedVersion,null)})
test('foreign team, wrong formation and unidentified slots without explicit pending evidence are rejected',()=>{assert.equal(documentMatchLineup(entries,evidence,{...context,teamId:'foreign'}),null);assert.equal(documentMatchLineup(entries,{...evidence,lineup:{...evidence.lineup,formation:'3-3-2'}},context),null);assert.equal(documentMatchLineup(entries,{...evidence,lineup:{...evidence.lineup,slots:evidence.lineup.slots.map((s,i)=>i===7?{...s,identityPending:false}:s)}},context),null)})
