-- CreateTable
CREATE TABLE "shop_settings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "logo" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_settings_pkey" PRIMARY KEY ("id")
);
