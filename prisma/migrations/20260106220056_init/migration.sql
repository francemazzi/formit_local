-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL,
    "error" TEXT,
    "data" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "CustomCheckCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sampleType" TEXT NOT NULL DEFAULT 'FOOD_PRODUCT'
);

-- CreateTable
CREATE TABLE "CustomCheckParameter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "categoryId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "analysisMethod" TEXT,
    "criterionType" TEXT NOT NULL DEFAULT 'HYGIENE',
    "satisfactoryValue" TEXT,
    "acceptableValue" TEXT,
    "unsatisfactoryValue" TEXT,
    "bibliographicReferences" TEXT,
    "notes" TEXT,
    CONSTRAINT "CustomCheckParameter_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CustomCheckCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PdfExtraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "fileName" TEXT NOT NULL,
    "extractedData" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomCheckCategory_name_key" ON "CustomCheckCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomCheckParameter_categoryId_parameter_key" ON "CustomCheckParameter"("categoryId", "parameter");

-- CreateIndex
CREATE INDEX "PdfExtraction_fileName_idx" ON "PdfExtraction"("fileName");

-- CreateIndex
CREATE INDEX "PdfExtraction_createdAt_idx" ON "PdfExtraction"("createdAt");
