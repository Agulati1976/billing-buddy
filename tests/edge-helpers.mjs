import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

// Run the actual Deno TypeScript handlers with isolated Supabase/provider mocks.
export function edgeFunction(name,{createClient=()=>{throw new Error('Unexpected database access');},fetch=()=>{throw new Error('Unexpected provider call');},env={}}={}) {
  let handler;
  const modules=new Map();
  const context=vm.createContext({Request,Response,Headers,TextEncoder,TextDecoder,Uint8Array,URL,atob,btoa,crypto:webcrypto,
    console:{error(){}},fetch,Deno:{env:{get:key=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',...env})[key]},serve:fn=>{handler=fn;}}});
  const load = filename => {
    if(modules.has(filename)) return modules.get(filename).exports;
    const module={exports:{}};modules.set(filename,module);
    const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const require = specifier => specifier.startsWith('https://') ? {createClient} : load(path.resolve(path.dirname(filename),specifier));
    vm.runInContext('(function(require,module,exports){'+source+'\n})',context,{filename})(require,module,module.exports);
    return module.exports;
  };
  load(path.resolve('supabase/functions',name,'index.ts'));
  return handler;
}

export function mockClients({user={id:'11111111-1111-4111-8111-111111111111'},tables={},rpc=()=>({data:true,error:null})}={}) {
  const calls=[];
  function from(table) {
    const call={table,filters:[],action:'select'};calls.push(call);
    const chain=new Proxy({}, {get(_target,key){
      if(key==='then') return (resolve,reject) => Promise.resolve(typeof tables[table]==='function' ? tables[table](call) : (tables[table]??{data:null,error:null})).then(resolve,reject);
      return (...args)=>{if(['eq','is','in','lt','gt','range'].includes(key))call.filters.push([key,...args]);if(['insert','update','upsert'].includes(key)){call.action=key;call.payload=args[0];}return chain;};
    }});
    return chain;
  }
  const client={from,auth:{getUser:async()=>({data:{user},error:null}),admin:{getUserById:async()=>({data:{user:{email:'owner@example.invalid'}},error:null})}},rpc:async(name,args)=>{calls.push({rpc:name,args});return rpc(name,args);}};
  return {calls,createClient:()=>client};
}
