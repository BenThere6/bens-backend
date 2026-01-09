/*
  Warnings:

  - A unique constraint covering the columns `[profileId,plaidId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[profileId,pendingPlaidId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `PlaidItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Transaction_plaidId_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlaidItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "institutionName" TEXT,
    "cursor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaidItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlaidItem" ("accessToken", "createdAt", "cursor", "id", "institutionName", "itemId", "profileId") SELECT "accessToken", "createdAt", "cursor", "id", "institutionName", "itemId", "profileId" FROM "PlaidItem";
DROP TABLE "PlaidItem";
ALTER TABLE "new_PlaidItem" RENAME TO "PlaidItem";
CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_profileId_plaidId_key" ON "Transaction"("profileId", "plaidId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_profileId_pendingPlaidId_key" ON "Transaction"("profileId", "pendingPlaidId");
