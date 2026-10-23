import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const files=readdirSync('supabase/functions',{withFileTypes:true})
  .filter(entry=>entry.isDirectory()&&!entry.name.startsWith('_'))
  .map(entry=>path.join('supabase/functions',entry.name,'index.ts'));
const result=spawnSync(process.execPath,['node_modules/deno/bin.cjs','check','--no-lock','--config','supabase/deno.json',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
