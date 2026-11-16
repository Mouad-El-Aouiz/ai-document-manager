ALTER TABLE "AuditLog" ADD COLUMN "requestId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "ip" TEXT;
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");