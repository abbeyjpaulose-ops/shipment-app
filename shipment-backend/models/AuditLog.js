import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    actorUserId: { type: Number },
    actorUsername: { type: String, trim: true },
    actorEmail: { type: String, trim: true },
    actorRole: { type: String, trim: true },

    action: { type: String, required: true, trim: true },
    entity: { type: String, trim: true },
    source: { type: String, trim: true },

    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

AuditLogSchema.index({ GSTIN_ID: 1, createdAt: -1 });

const ttlDays = Number(process.env.AUDIT_LOG_TTL_DAYS) || 90;
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * ttlDays }
);

export default mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
