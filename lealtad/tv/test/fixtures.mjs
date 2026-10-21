import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function fixtureDb({failBatch=false}={}) {
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['0001_tv_admin.sql','0002_photo_duration.sql','0003_independent_1gb.sql'])sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  sqlite.exec("INSERT INTO admin_users(id,username,display_name,password_hash) VALUES('admin','admin','Ficticio','not-real')");
  const db={sqlite,prepare(sql){
    const statement=args=>({
      sql,args,bind:(...values)=>statement(values),
      first:async()=>sqlite.prepare(sql).get(...args)||null,
      all:async()=>({results:sqlite.prepare(sql).all(...args)}),
      run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}),
    });
    return statement([]);
  },async batch(statements){
    if(failBatch)throw new Error('D1 simulated failure');
    sqlite.exec('BEGIN');
    try {const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
  return db;
}
export function fixtureBucket() {
  const objects=new Map();
  return {objects,async put(key,stream,options){const bytes=new Uint8Array(await new Response(stream).arrayBuffer());objects.set(key,{size:bytes.byteLength,bytes,options});return {size:bytes.byteLength};},async head(key){const item=objects.get(key);return item?{size:item.size,key}:null;},async delete(key){objects.delete(key);},async list(){return {objects:[...objects].map(([key,item])=>({key,size:item.size})),truncated:false};}};
}
