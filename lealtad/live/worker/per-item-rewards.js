// Every balance change, operation key and audit snapshot commits in one trigger.
function operationKey(card,input,ApiError){
 const version=input.expectedVersion;
 if(!Number.isSafeInteger(version)||version!==card.reward_version)throw new ApiError(409,'card_changed','La tarjeta cambió. Vuelve a buscarla antes de confirmar.');
 const id=input.operationId;
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(id))throw new ApiError(400,'invalid_operation','Identificador de operación inválido.');
 return id;
}
function operationError(error,ApiError){
 if(String(error).includes('reward_decision_required'))throw new ApiError(409,'reward_decision_required','Primero decide qué hacer con tu bebida gratis para continuar.');
 if(String(error).includes('reward_unavailable'))throw new ApiError(409,'reward_unavailable','No hay bebidas gratis disponibles.');
 if(String(error).includes('reward_conflict'))throw new ApiError(409,'card_changed','La tarjeta cambió. Vuelve a buscarla antes de confirmar.');
 if(String(error).includes('operation_processed')||String(error).includes('UNIQUE'))throw new ApiError(409,'operation_processed','Esta operación ya fue registrada. Actualiza la tarjeta.');
 throw error;
}
export async function recordRewardOperation(env,staff,card,input,kind,quantity,day,now,ApiError){
 const id=operationKey(card,input,ApiError);
 try{
  await env.DB.prepare(`INSERT INTO per_item_reward_operations
   (id,business_id,card_id,customer_id,employee_id,kind,paid_items,before_stamps,before_rewards,before_version,business_day,created_at,before_choices)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(id,staff.business_id,card.id,card.customer_id,staff.id,kind,quantity,card.stamps,card.rewards_pending,card.reward_version,day,now,card.reward_choices_pending).run();
 }catch(error){
  operationError(error,ApiError);
 }
}
export async function recordRewardChoice(env,staff,card,input,day,now,ApiError){
 const id=operationKey(card,input,ApiError);
 if(!['save','redeem_now'].includes(input.decision))throw new ApiError(400,'invalid_reward_decision','Elige canjear ahora o guardar para después.');
 if(card.stamp_policy!=='per_item'||card.reward_choices_pending<1)throw new ApiError(409,'reward_unavailable','No hay recompensas por decidir.');
 try{
  await env.DB.prepare(`INSERT INTO reward_choice_operations
   (id,business_id,card_id,customer_id,employee_id,decision,before_stamps,before_rewards,before_choices,before_version,business_day,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(id,staff.business_id,card.id,card.customer_id,staff.id,input.decision,card.stamps,card.rewards_pending,card.reward_choices_pending,card.reward_version,day,now).run();
 }catch(error){operationError(error,ApiError);}
}
