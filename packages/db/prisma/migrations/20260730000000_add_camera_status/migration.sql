-- AlterTable
ALTER TABLE "dvrs" ADD COLUMN     "lastChannelCheckAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "channelCheckIntervalMin" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "cameras" (
    "id" TEXT NOT NULL,
    "dvrId" TEXT NOT NULL,
    "channelNumber" INTEGER NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "lastEventAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cameras_dvrId_channelNumber_key" ON "cameras"("dvrId", "channelNumber");

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_dvrId_fkey" FOREIGN KEY ("dvrId") REFERENCES "dvrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
