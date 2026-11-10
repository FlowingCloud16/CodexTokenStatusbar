export const A = '01a1ba45-994e-75f3-ac70-6be9853c67b9';
export const B = '01a1ba45-994e-75f3-ac70-6be9853c67b8';
export const fixtureModule = `
const A=${JSON.stringify(A)};
window.codexWindowType='electron';
window.electronBridge={windowType:'electron',getSentryInitOptions:()=>({appVersion:'26.1103.32239'})};
const scopeDef={id:Symbol('mounted-app-scope')};
const locationAtom=Symbol('location'),aliasAtom=Symbol('alias');
let node={location:{pathname:'/local/'+A,search:''},core:A,hostId:'local',aliases:new Map()};
const chain=new Map([[scopeDef.id,node]]),listeners=new Set();let deliveries=0;
const footer=document.querySelector('[data-composer-footer-responsive]');
Object.defineProperty(footer,'__reactFiber$fixture',{value:{return:{memoizedProps:{value:chain},return:null}}});
const retained=new Map([[A,{footer,node}]]);
const modules={
 OWtl:{u:scopeDef},
 GNwQ:{GB:(def,c,n)=>{if(def!==scopeDef||c.get(scopeDef.id)!==n)throw Error('wrong scope');return{get:(atom,id)=>atom===locationAtom?n.location:atom===aliasAtom?n.aliases.get(id)??null:null}}},
 nlNF:{x2:locationAtom},V3rO:{Tl:aliasAtom},gp55:{oE:()=>node.core?{id:node.core,hostId:node.hostId}:null},
 TL6G:{O1:{interceptHostMessages:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}}
};
function runtimeRequire(){throw Error('must not initialize business module')}
runtimeRequire.c=Object.fromEntries(Object.entries(modules).map(([id,exports])=>[id,{exports}]));
window.__fixture={
 retainedComposer(id){
  if(!retained.has(id)){
   const nextFooter=footer.cloneNode(false);nextFooter.textContent='Composer';document.body.append(nextFooter);
   const nextNode={location:{pathname:'/local/'+id,search:''},core:id,hostId:'local',aliases:new Map()};
   const nextChain=new Map([[scopeDef.id,nextNode]]);
   Object.defineProperty(nextFooter,'__reactFiber$fixture',{value:{return:{memoizedProps:{value:nextChain},return:null}}});
   retained.set(id,{footer:nextFooter,node:nextNode});
  }
  for(const [key,value] of retained){value.footer.style.display=key===id?'flex':'none'}
  node=retained.get(id).node;
 },
 switchCore(id,hostId='local'){node.location={pathname:'/local/'+id,search:hostId==='local'?'':'?hostId='+hostId};node.core=id;node.hostId=hostId},
 newAlias(id){node.location={pathname:'/local/'+id,search:''};node.core=null;node.hostId='local'},
 bindAlias(alias,id){node.aliases.set(alias,id);node.core=id},
 emit(message){for(const fn of listeners)if(fn(message))throw Error('host message was intercepted');deliveries++},
 inspect(){return{listeners:listeners.size,deliveries}}
};
export{runtimeRequire as __webpack_require__};`;
export const fixtureHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<p>Integrated bundle test · Simulated client state and messages</p>
<div data-composer-footer-responsive style="display:flex;margin:400px 40px 0">Composer</div>
<script type="module" src="/assets/348410.792d1c9584.js"></script></body></html>`;
