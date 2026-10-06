/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Resume` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Resume_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Resume_userId_key" ON "Resume"("userId");
