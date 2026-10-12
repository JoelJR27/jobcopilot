ALTER TABLE "Job" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Job" ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Job_sourceId_active_lastSeenAt_idx" ON "Job"("sourceId", "active", "lastSeenAt");
CREATE TABLE "RateLimitBucket" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "resetAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
CREATE TABLE "JobPipelineState" ("id" TEXT PRIMARY KEY, "userCursor" TEXT, "jobCursor" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
