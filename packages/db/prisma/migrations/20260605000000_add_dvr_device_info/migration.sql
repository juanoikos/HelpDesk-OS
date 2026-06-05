-- AlterTable: add device info fields to dvrs
ALTER TABLE "dvrs" ADD COLUMN "deviceModel"   TEXT;
ALTER TABLE "dvrs" ADD COLUMN "firmware"      TEXT;
ALTER TABLE "dvrs" ADD COLUMN "deviceType"    TEXT;
ALTER TABLE "dvrs" ADD COLUMN "channelNames"  JSONB;
ALTER TABLE "dvrs" ADD COLUMN "lastInfoFetch" TIMESTAMP(3);
