import {rewardOutcome} from './per-item-rewards.js';

// The existing event/operation schema caps quantities at 99. Daily cards have a lower state-dependent cap.
export const ADMIN_STAMP_LIMIT=99;
export function adjustmentPreview(card,quantity,ApiError){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>ADMIN_STAMP_LIMIT)throw new ApiError(400,'invalid_adjustment_quantity','Ingresa una cantidad entera de 1 a 99.');
 const perItem=card.stamp_policy==='per_item';
 if(perItem&&card.reward_choices_pending>0)throw new ApiError(409,'reward_decision_required','Primero decide qué hacer con tu bebida gratis para continuar.');
 const maxQuantity=perItem?ADMIN_STAMP_LIMIT:Math.max(0,card.reward_goal-card.stamps);
 if(quantity>maxQuantity)throw new ApiError(400,'invalid_adjustment_quantity',`Con el estado actual de la tarjeta puedes agregar hasta ${maxQuantity} sellos.`);
 const outcome=perItem?rewardOutcome(card,quantity):{stampsAfter:card.stamps+quantity,rewardsGenerated:0,rewardChoicesPendingAfter:0,rewardsPendingAfter:0};
 return {quantity,maxQuantity,expectedStamps:card.stamps,expectedVersion:card.reward_version,expectedUpdatedAt:card.updated_at,goal:card.reward_goal,stampsAfter:outcome.stampsAfter,rewardsGenerated:outcome.rewardsGenerated,rewardChoicesAfter:outcome.rewardChoicesPendingAfter,rewardsPendingAfter:outcome.rewardsPendingAfter,rewardReady:!perItem&&outcome.stampsAfter===card.reward_goal};
}
export async function addAdministrativeStamps(env,admin,card,input,ApiError){
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(reason.length<5||reason.length>200)throw new ApiError(400,'invalid_adjustment_reason','Escribe un motivo de 5 a 200 caracteres.');
 if(input.delta!==undefined&&input.delta!==1||input.cancelToday)throw new ApiError(400,'invalid_adjustment','Elige un ajuste válido.');
 const preview=adjustmentPreview(card,input.quantity,ApiError);
 if(input.expectedStamps!==card.stamps||input.expectedVersion!==card.reward_version||input.expectedUpdatedAt!==card.updated_at)throw new ApiError(409,'card_changed','La tarjeta cambió. Actualízala antes de ajustar los sellos.');
 if(typeof input.operationId!=='string'||! /^[A-Za-z0-9_-]{8,80}$/.test(input.operationId))throw new ApiError(400,'invalid_operation','Identificador de operación inválido.');
 const now=new Date().toISOString(),metadata=JSON.stringify({kind:'stamp_added',card_id:card.id,quantity:input.quantity,reason,progress_before:card.stamps,rewards_pending_before:card.rewards_pending,reward_choices_before:card.reward_choices_pending});
 try{
  await env.DB.batch([
   // Relative update + snapshot comparison; the existing per-item trigger normalizes all complete goals.
   env.DB.prepare(`UPDATE loyalty_cards SET stamps=stamps+?,updated_at=? WHERE id=? AND business_id=? AND customer_id=? AND stamps=? AND reward_version=? AND updated_at=?
    AND (?='per_item' OR stamps+?<=?) AND NOT EXISTS(SELECT 1 FROM admin_audit_log WHERE id=?)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND business_id=? AND role='customer' AND active=1 AND deleted_at IS NULL)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND business_id=? AND role='admin' AND active=1 AND deleted_at IS NULL AND must_change_secret=0)`)
    .bind(input.quantity,now,card.id,admin.business_id,card.customer_id,card.stamps,card.reward_version,card.updated_at,card.stamp_policy,input.quantity,card.reward_goal,input.operationId,card.customer_id,admin.business_id,admin.id,admin.business_id),
   // The NOT NULL admin_id constraint is the transaction guard: a failed CAS aborts the whole D1 batch.
   // One existing audit row represents the adjustment, with the actual post-trigger state, never a purchase.
   env.DB.prepare(`INSERT INTO admin_audit_log(id,business_id,admin_id,target_user_id,action,created_at,metadata)
    VALUES(?,?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'customer_updated',?,
    (SELECT json_patch(?,json_object('progress_after',stamps,'rewards_pending_after',rewards_pending,'reward_choices_after',reward_choices_pending,'rewards_generated',reward_choices_pending-?)) FROM loyalty_cards WHERE id=? AND business_id=?))`)
    .bind(input.operationId,admin.business_id,admin.id,card.customer_id,now,metadata,card.reward_choices_pending,card.id,admin.business_id)
  ]);
 }catch(error){
  const detail=String(error)+' '+String(error.cause?.message||'');
  if(detail.includes('reward_decision_required'))throw new ApiError(409,'reward_decision_required','Primero decide qué hacer con tu bebida gratis para continuar.');
  if(detail.includes('admin_audit_log.admin_id')||detail.includes('UNIQUE'))throw new ApiError(409,'card_changed','La tarjeta cambió o el ajuste ya fue registrado. Actualiza e intenta nuevamente.');
  throw error;
 }
 return preview;
}
