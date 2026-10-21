import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../web/progress-sync.js',import.meta.url),'utf8');
const tick = async () => { for(let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve)); };
function harness(initial={}, remote=[], fail=false) {
  const values=new Map(Object.entries(initial)); const calls=[]; const listeners={}; const note={textContent:''};
  const store={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),key:i=>[...values.keys()][i],get length(){return values.size;}};
  const window={addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),dispatchEvent:event=>{for(const fn of listeners[event.type]||[])fn(event);}};
  const document={cookie:'learning_csrf=test-csrf',querySelectorAll:()=>[note],querySelector:()=>null};
  const fetch=async (url,options)=>{
    calls.push({url,options});
    if(fail) return {ok:false,status:503};
    if(options.method==='PUT')return {ok:true,status:204};
    return {ok:true,status:200,json:async()=>({items:remote})};
  };
  vm.runInNewContext(source,{window,document,localStorage:store,fetch,Event:class{constructor(type){this.type=type;}}});
  return {values,calls,window,note,emit:(type,detail)=>window.dispatchEvent({type,detail})};
}
test('cloud and legacy IDs share the progress contract; metadata keys are excluded',()=>{
  const h=harness({'learning-v2-aws-01':'1','learning-v2-azure-07':'0','learning-v2-lesson-13':'1','learning-v2-updated-aws-01':'date','learning-v2-score':'7','other':'x'});
  assert.deepEqual(Array.from(h.window.LearningProgress.localIDs()),['aws-01','azure-07','lesson-13']);
  for(const id of ['aws-08','azure-00','aws-01/other','lesson-14','aws-01\n']) assert.equal(h.window.LearningProgress.validID(id),false);
});
test('auth pull merges newer local cloud progress and newer remote legacy progress',async()=>{
  const old='2026-10-01T00:00:00Z', recent='2026-10-02T00:00:00Z';
  const h=harness({'learning-v2-aws-01':'1','learning-v2-updated-aws-01':recent,'learning-v2-lesson-01':'0','learning-v2-updated-lesson-01':old},[{lessonId:'aws-01',completed:false,updatedAt:old},{lessonId:'lesson-01',completed:true,updatedAt:recent},{lessonId:'azure-07',completed:true,updatedAt:recent}]);
  h.emit('learning-auth-state',{signedIn:true}); await tick();
  assert.equal(h.values.get('learning-v2-lesson-01'),'1');
  assert.equal(h.values.get('learning-v2-azure-07'),'1');
  const put=h.calls.find(c=>c.options.method==='PUT');
  assert.equal(put.url,'/api/progress/aws-01');
  assert.equal(JSON.parse(put.options.body).completed,true);
  assert.equal(put.options.headers['X-CSRF-Token'],'test-csrf');
  assert.equal(h.note.textContent,'Synced to your account');
});
test('completion and undo sync through existing API, unknown IDs do not',async()=>{
  const h=harness(); h.emit('learning-auth-state',{signedIn:true}); await tick();
  h.emit('learning-progress-change',{lessonId:'azure-02',complete:true,updatedAt:'2026-10-02T00:00:00Z'});
  h.emit('learning-progress-change',{lessonId:'azure-02',complete:false,updatedAt:'2026-10-02T00:01:00Z'});
  h.emit('learning-progress-change',{lessonId:'azure-99',complete:true}); await tick();
  const writes=h.calls.filter(c=>c.options.method==='PUT');
  assert.equal(writes.length,2);
  assert.deepEqual(writes.map(c=>JSON.parse(c.options.body).completed),[true,false]);
});
test('failed account sync is visible and never erases local completion',async()=>{
  const h=harness({'learning-v2-aws-07':'1'},[],true);
  h.emit('learning-auth-state',{signedIn:true}); await tick();
  assert.match(h.note.textContent,/sync failed/);
  assert.equal(h.values.get('learning-v2-aws-07'),'1');
});
