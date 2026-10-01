// The SQL trigger commits balance, reward counter, operation key and audit together.
export async function recordRewardOperation(env,staff,card,input,kind,quantity,day,now,ApiError){
 const version=input.expectedVersion;
 if(!Number.isSafeInteger(version)||version!==card.reward_version)throw new ApiError(409,'card_changed','La tarjeta cambió. Vuelve a buscarla antes de confirmar.');
 const id=input.operationId;
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(id))throw new ApiError(400,'invalid_operation','Identificador de operación inválido.');
 try{
  await env.DB.prepare(`INSERT INTO per_item_reward_operations
   (id,business_id,card_id,customer_id,employee_id,kind,paid_items,before_stamps,before_rewards,before_version,business_day,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(id,staff.business_id,card.id,card.customer_id,staff.id,kind,quantity,card.stamps,card.rewards_pending,card.reward_version,day,now).run();
 }catch(error){
  if(String(error).includes('reward_unavailable'))throw new ApiError(409,'reward_unavailable','No hay bebidas gratis disponibles.');
  if(String(error).includes('reward_conflict'))throw new ApiError(409,'card_changed','La tarjeta cambió. Vuelve a buscarla antes de confirmar.');
  if(String(error).includes('UNIQUE'))throw new ApiError(409,'operation_processed','Esta operación ya fue registrada. Actualiza la tarjeta.');
  throw error;
 }
}
