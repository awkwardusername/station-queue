-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "stationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("stationId","userId")
);

-- CreateTable
CREATE TABLE "Config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Queue_userId_idx" ON "Queue"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Queue_stationId_position_key" ON "Queue"("stationId", "position");

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;
