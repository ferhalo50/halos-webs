import {ADMIN_STAMP_LIMIT,adjustmentPreview,addAdministrativeStamps} from './admin-stamp-adjustment.js';

const actions=new Set(['add','remove','clear','reward_add','reward_remove','reward_clear']);
export function cardAdjustmentPreview(card,quantity,action,ApiError){
 if(!actions.has(action))throw new ApiError(400,'invalid_adjustment','Elige un ajuste válido.');
 if(action==='add')return {...adjustmentPreview(card,quantity,ApiError),action};
 const reward=action.startsWith('reward_'),clear=action.endsWith('clear');
 if(reward&&(card.business_slug!=='santofe'||card.stamp_policy!=='per_item'))throw new ApiError(403,'forbidden','No tienes permiso para realizar esta acción.');
 if(!reward&&card.stamp_policy!=='per_item'&&card.stamps>=card.reward_goal)throw new ApiError(409,'earned_reward_protected','Esta tarjeta tiene una recompensa disponible. Canjéala antes de retirar progreso.');
 const before=reward?card.rewards_pending:card.stamps;
 const maxQuantity=action==='reward_add'?ADMIN_STAMP_LIMIT:clear?before:Math.min(ADMIN_STAMP_LIMIT,before);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>maxQuantity||(clear&&quantity!==before))throw new ApiError(400,'invalid_adjustment_quantity','Ingresa una cantidad válida para el saldo actual.');
 const after=before+(action==='reward_add'?quantity:-quantity);
 if(!Number.isSafeInteger(after))throw new ApiError(400,'invalid_adjustment_quantity','Ingresa una cantidad válida para el saldo actual.');
 return {action,quantity,maxQuantity,expectedStamps:card.stamps,expectedVersion:card.reward_version,expectedUpdatedAt:card.updated_at,
  goal:card.reward_goal,stampsAfter:reward?card.stamps:after,rewardsGenerated:0,rewardChoicesAfter:card.reward_choices_pending,rewardsPendingAfter:reward?after:card.rewards_pending,rewardsPendingBefore:card.rewards_pending,rewardReady:false};
}

export async function adjustAdministrativeCard(env,admin,card,input,ApiError){
 const action=input.action===undefined?'add':input.action;
 if(action==='add')return addAdministrativeStamps(env,admin,card,input,ApiError);
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(reason.length<5||reason.length>200)throw new ApiError(400,'invalid_adjustment_reason','Escribe un motivo de 5 a 200 caracteres.');
 if(input.delta!==undefined||input.cancelToday)throw new ApiError(400,'invalid_adjustment','Elige un ajuste válido.');
 if(input.expectedStamps!==card.stamps||input.expectedVersion!==card.reward_version||input.expectedUpdatedAt!==card.updated_at)throw new ApiError(409,'card_changed','La tarjeta cambió. Actualiza e intenta nuevamente.');
 const preview=cardAdjustmentPreview(card,input.quantity,action,ApiError);
 if(typeof input.operationId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(input.operationId))throw new ApiError(400,'invalid_operation','Identificador de operación inválido.');
 const reward=action.startsWith('reward_'),kind=({remove:'stamp_removed',clear:'progress_cleared',reward_add:'saved_reward_added',reward_remove:'saved_reward_removed',reward_clear:'saved_rewards_cleared'})[action];
 const now=new Date().toISOString(),metadata=JSON.stringify({kind,quantity:input.quantity,reason,card_id:card.id,progress_before:card.stamps,progress_after:preview.stampsAfter,rewards_pending_before:card.rewards_pending,rewards_pending_after:preview.rewardsPendingAfter,reward_choices_before:card.reward_choices_pending,reward_choices_after:card.reward_choices_pending,redeemed_before:card.redeemed_count,redeemed_after:card.redeemed_count});
 try{
  await env.DB.batch([
   env.DB.prepare(`UPDATE loyalty_cards SET ${reward?'rewards_pending=?,reward_version=reward_version+1':'stamps=?'},updated_at=?
    WHERE id=? AND business_id=? AND customer_id=? AND stamps=? AND rewards_pending=? AND reward_choices_pending=? AND reward_version=? AND updated_at=?
    AND NOT EXISTS(SELECT 1 FROM admin_audit_log WHERE id=?)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND business_id=? AND role='customer' AND active=1 AND deleted_at IS NULL)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND business_id=? AND role='admin' AND active=1 AND deleted_at IS NULL AND must_change_secret=0)`)
    .bind(reward?preview.rewardsPendingAfter:preview.stampsAfter,now,card.id,admin.business_id,card.customer_id,card.stamps,card.rewards_pending,card.reward_choices_pending,card.reward_version,card.updated_at,input.operationId,card.customer_id,admin.business_id,admin.id,admin.business_id),
   // NOT NULL is the transaction guard: a failed snapshot/replay/role check rolls back the batch.
   env.DB.prepare(`INSERT INTO admin_audit_log(id,business_id,admin_id,target_user_id,action,created_at,metadata)
    VALUES(?,?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'customer_updated',?,?)`)
    .bind(input.operationId,admin.business_id,admin.id,card.customer_id,now,metadata)
  ]);
 }catch(error){
  const detail=String(error)+' '+String(error.cause?.message||'');
  if(detail.includes('admin_audit_log.admin_id')||detail.includes('UNIQUE'))throw new ApiError(409,'card_changed','La tarjeta cambió o el ajuste ya fue registrado. Actualiza e intenta nuevamente.');
  throw error;
 }
 return preview;
}
