type Page<T>={data:T[]|null;error:{message:string}|null};
type Query<T>={range:(start:number,end:number)=>PromiseLike<Page<T>>;order:(column:string)=>Query<T>};
export async function allRows<T>(query:Query<T>):Promise<Page<T>>{
 const rows:T[]=[];const ordered=query.order("id");
 for(let offset=0;;offset+=500){const page=await ordered.range(offset,offset+499);if(page.error)throw new Error("Could not load complete business data");rows.push(...(page.data??[]));if(!page.data||page.data.length<500)return {data:rows,error:null};}
}
