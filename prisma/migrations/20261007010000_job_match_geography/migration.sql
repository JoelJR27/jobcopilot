ALTER TABLE "JobMatch" ADD COLUMN "geographyRank" INTEGER NOT NULL DEFAULT 3;
CREATE INDEX "JobMatch_userId_geographyRank_score_idx" ON "JobMatch"("userId", "geographyRank", "score");
