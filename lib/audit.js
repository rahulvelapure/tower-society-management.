// Append-only audit trail for privileged and financial actions.
// Deliberately non-throwing: an audit-write failure must never break the
// underlying business action - it is logged loudly to the server console
// instead. Never pass secrets/tokens/passwords in `context`.

const { AuditLog } = require('../models/financeModels');
const roles = require('./roles');

async function record({ actor, action, entityType, entityId, context }) {
    try {
        await AuditLog.create({
            actor: actor ? actor._id || actor : undefined,
            actorRole: actor ? roles.effectiveRole(actor) : undefined,
            action,
            entityType,
            entityId: entityId ? String(entityId) : undefined,
            context
        });
    } catch (err) {
        console.error(`AUDIT WRITE FAILED for action ${action}:`, err.message);
    }
}

module.exports = { record };
