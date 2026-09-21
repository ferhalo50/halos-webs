import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
test('additive preferences preserve old styles, QR tokens and balances; enforce matching card tenant',()=>{
 const db=new DatabaseSync(':memory:');try{
 const dir=new URL('../migrations/',import.meta.url),files=readdirSync(dir).sort();for(const f of files.filter(f=>f<'0009'))db.exec(readFileSync(new URL(f,dir),'utf8'));
 for(const [index,style] of ['classic','cowboy','bow'].entries()){
  db.prepare("INSERT INTO users(id,business_id,role,name,secret_hash,secret_salt) VALUES(?,'business_renace','customer','Test','hash','salt')").run('u'+index);
  db.prepare("INSERT INTO loyalty_cards(id,business_id,customer_id,qr_token,stamps,redeemed_count,stamp_style) VALUES(?,'business_renace',?,?,5,2,?)").run('c'+index,'u'+index,'old-private-token'+index,style);
 }
 const before=db.prepare('SELECT * FROM loyalty_cards ORDER BY id').all();for(const f of files.filter(f=>f>='0009'))db.exec(readFileSync(new URL(f,dir),'utf8'));
 assert.deepEqual(db.prepare('SELECT * FROM loyalty_cards ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT stamp_style FROM loyalty_card_preferences ORDER BY card_id').all().map(r=>r.stamp_style),['classic','cowboy','bow']);
 assert.throws(()=>db.prepare("UPDATE loyalty_card_preferences SET business_id='business_mooncoffee' WHERE card_id='c0'").run(),/tenant_mismatch/);
 assert.equal(db.prepare("SELECT reward_goal FROM businesses WHERE slug='renace'").get().reward_goal,9);assert.equal(db.prepare("SELECT reward_goal FROM businesses WHERE slug='mooncoffee'").get().reward_goal,8);
 db.exec(readFileSync(new URL('0010_moon_business.sql',dir),'utf8'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM businesses').get().n,2);
 }finally{db.close();}
});
