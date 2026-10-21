// Integer seconds: quick slides through five-minute notices, never video trimming.
export const validDuration = value => Number.isInteger(value) && value >= 1 && value <= 300;

export async function saveDuration(env, actorId, id, body) {
  if (!validDuration(body?.durationSeconds) || !Number.isSafeInteger(body?.revision) || body.revision < 0) {
    return { status: 400, error: 'Elige entre 1 y 300 segundos enteros y recarga si la biblioteca cambió.' };
  }
  // D1 batch is transactional. The audit insert depends on the immediately
  // preceding compare-and-swap, so neither conflicts nor failures leave an audit.
  const result = await env.TV_DB.batch([
    env.TV_DB.prepare(`UPDATE media SET duration_seconds=?,duration_revision=duration_revision+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND media_type='image' AND deleting=0 AND duration_revision=?`)
      .bind(body.durationSeconds, id, body.revision),
    env.TV_DB.prepare(`INSERT INTO audit_log(actor_id,action,media_id,metadata_json)
      SELECT ?,'photo_duration',?,? WHERE changes()=1`)
      .bind(actorId, id, JSON.stringify({ durationSeconds: body.durationSeconds, revision: body.revision + 1 })),
  ]);
  return Number(result[0]?.meta?.changes) === 1
    ? { status: 200, ok: true, revision: body.revision + 1 }
    : { status: 409, error: 'La fotografía cambió o ya no está disponible. Actualiza antes de guardar.' };
}
