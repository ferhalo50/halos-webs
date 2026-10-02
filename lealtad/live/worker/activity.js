export function activitySource(){
return `SELECT id,created_at,event_type,card_id,customer,customer_phone,employee,reason,quantity FROM (
      SELECT e.id,e.created_at,CASE WHEN e.voided=1 THEN 'stamp_voided'
        WHEN json_extract(e.metadata,'$.decision_flow')=1 AND e.event_type='redeem' THEN 'saved_reward_redeemed'
        WHEN json_extract(e.metadata,'$.decision_flow')=1 AND json_extract(e.metadata,'$.rewards_generated')>0 THEN 'reward_generated'
        ELSE e.event_type END AS event_type,e.card_id,customer.name AS customer,CASE WHEN customer.role='customer' THEN customer.phone END AS customer_phone,employee.name AS employee,COALESCE(json_extract(e.metadata,'$.description'),'') AS reason,e.quantity
      FROM loyalty_events e LEFT JOIN users customer ON customer.id=e.customer_id AND customer.business_id=e.business_id JOIN users employee ON employee.id=e.employee_id WHERE e.business_id=?
      UNION ALL
      SELECT audit.id,audit.created_at,
        CASE WHEN audit.action='customer_updated' AND audit.metadata='{"kind":"demo_reset"}' THEN 'demo_reset' ELSE audit.action END AS event_type,
        COALESCE(card.id,'') AS card_id,customer.name AS customer,CASE WHEN customer.role='customer' THEN customer.phone END AS customer_phone,administrator.name AS employee,'' AS reason,0 AS quantity
      FROM admin_audit_log audit LEFT JOIN users customer ON customer.id=audit.target_user_id AND customer.business_id=audit.business_id JOIN users administrator ON administrator.id=COALESCE(audit.actor_id,audit.admin_id)
      LEFT JOIN loyalty_cards card ON card.customer_id=customer.id AND card.business_id=audit.business_id WHERE audit.business_id=?
      UNION ALL
      SELECT a.id,a.created_at,CASE WHEN a.after_stamps>a.before_stamps THEN 'stamp_added' ELSE 'stamp_removed' END,a.card_id,customer.name,CASE WHEN customer.role='customer' THEN customer.phone END,administrator.name,a.reason,1 AS quantity
      FROM stamp_adjustments a LEFT JOIN users customer ON customer.id=a.customer_id AND customer.business_id=a.business_id JOIN users administrator ON administrator.id=a.admin_id WHERE a.business_id=?
      UNION ALL
      SELECT choice.id,choice.created_at,CASE WHEN choice.decision='save' THEN 'reward_saved' ELSE 'reward_redeemed_now' END,
        choice.card_id,customer.name,CASE WHEN customer.role='customer' THEN customer.phone END,employee.name,
        printf('%s; progreso %d/%d; por decidir: %d; bebidas gratis guardadas: %d',
          CASE WHEN choice.decision='save' THEN '1 recompensa guardada' ELSE '1 recompensa canjeada ahora' END,
          choice.before_stamps,b.reward_goal,choice.before_choices-1,choice.before_rewards+CASE WHEN choice.decision='save' THEN 1 ELSE 0 END),1
      FROM reward_choice_operations choice JOIN businesses b ON b.id=choice.business_id
      LEFT JOIN users customer ON customer.id=choice.customer_id AND customer.business_id=choice.business_id
      JOIN users employee ON employee.id=choice.employee_id AND employee.business_id=choice.business_id WHERE choice.business_id=?
    )`;
}
