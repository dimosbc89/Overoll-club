import type postgres from 'postgres';
import type { Tx } from '../result.js';

export interface AuditEntry {
  brandId: string;
  actorUserId: string | null;
  employeeId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, string | number | boolean | null>;
  at: Date;
}

export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx`
    insert into public.audit_log (brand_id, actor_user_id, employee_id, action, entity, entity_id, details, created_at)
    values (${entry.brandId}, ${entry.actorUserId}, ${entry.employeeId ?? null}, ${entry.action},
      ${entry.entity}, ${entry.entityId}, ${tx.json(entry.details as postgres.JSONValue)}, ${entry.at})
  `;
}
