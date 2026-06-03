import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.searchJob.create({
    data: {
      searchKeyword: "sample",
      searchLocation: "office",
      searchType: "TEXT_SEARCH",
      status: "COMPLETED",
      totalFound: 0,
      totalSaved: 0,
      totalDuplicates: 0,
      startedAt: new Date(),
      finishedAt: new Date()
    }
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
