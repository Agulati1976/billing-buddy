import type { PostgrestError } from "@supabase/supabase-js";

type Page<T>={data:T[]|null;error:Pick<PostgrestError,"message"|"code"|"hint"|"details">|null;count?:number|null};
type Query<T>={range:(start:number,end:number)=>PromiseLike<Page<T>>;order:(column:string)=>Query<T>};
/** Read complete lists with stable ordering instead of silently accepting the REST row cap. */
export async function allRows<T>(query:Query<T>,key="id"):Promise<Page<T>>{
  const rows:T[]=[];
  const ordered=query.order(key);
  for(let offset=0;;offset+=500){
    const result=await ordered.range(offset,offset+499);
    if(result.error)return {...result,data:null};
    if(result.data===null && result.count!==undefined)return result;
    rows.push(...(result.data ?? []));
    if(!result.data || result.data.length<500)return {data:rows,error:null};
  }
}
