import { readFile, writeFile } from "node:fs/promises";
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const sourcePath = new URL("../docs/PROJECT-OVERVIEW.md", import.meta.url);
const outputPath = new URL("../docs/PROJECT-OVERVIEW.docx", import.meta.url);
const markdown = await readFile(sourcePath, "utf8");

const headingLevels = {
  1: HeadingLevel.TITLE,
  2: HeadingLevel.HEADING_1,
  3: HeadingLevel.HEADING_2,
};

function inlineRuns(text, options = {}) {
  const runs = [];
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("**") && token.endsWith("**")) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true, ...options }));
    } else if (token.startsWith("`") && token.endsWith("`")) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: "Consolas", ...options }));
    } else {
      runs.push(new TextRun({ text: token, ...options }));
    }
  }
  return runs;
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function tableBorders() {
  return {
    top: { style: BorderStyle.SINGLE, size: 4, color: "B7C3D0" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "B7C3D0" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "B7C3D0" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "B7C3D0" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "B7C3D0" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "B7C3D0" },
  };
}

function getTableColumnWidths(rows) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const usablePageWidth = 10_800;

  if (columnCount === 2) return [2_600, 8_200];
  return Array.from({ length: columnCount }, () => Math.floor(usablePageWidth / columnCount));
}

const children = [];
const lines = markdown.replace(/\r\n/g, "\n").split("\n");

for (let index = 0; index < lines.length;) {
  const line = lines[index];

  if (!line.trim()) {
    index += 1;
    continue;
  }

  const heading = line.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    children.push(new Paragraph({
      heading: headingLevels[heading[1].length],
      children: inlineRuns(heading[2]),
      spacing: { before: heading[1].length === 1 ? 0 : 260, after: 120 },
    }));
    index += 1;
    continue;
  }

  if (line.startsWith("```")) {
    const codeLines = [];
    index += 1;
    while (index < lines.length && !lines[index].startsWith("```")) {
      codeLines.push(lines[index]);
      index += 1;
    }
    if (index < lines.length) index += 1;
    children.push(new Paragraph({
      children: [new TextRun({ text: codeLines.join("\n"), font: "Consolas", size: 18 })],
      shading: { fill: "F3F5F7" },
      spacing: { before: 80, after: 160 },
    }));
    continue;
  }

  if (line.startsWith("|") && index + 1 < lines.length && /^\|\s*-/.test(lines[index + 1])) {
    const rows = [parseTableRow(line)];
    index += 2;
    while (index < lines.length && lines[index].startsWith("|")) {
      rows.push(parseTableRow(lines[index]));
      index += 1;
    }
    const columnWidths = getTableColumnWidths(rows);
    children.push(new Table({
      width: { size: 10_800, type: WidthType.DXA },
      columnWidths,
      layout: TableLayoutType.FIXED,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      borders: tableBorders(),
      rows: rows.map((cells, rowIndex) => new TableRow({
        children: cells.map((cell, cellIndex) => new TableCell({
          width: { size: columnWidths[cellIndex], type: WidthType.DXA },
          shading: rowIndex === 0 ? { fill: "E9EFF5" } : undefined,
          children: [new Paragraph({
            children: inlineRuns(cell, rowIndex === 0 ? { bold: true } : {}),
            spacing: { after: 0 },
          })],
        })),
      })),
    }));
    continue;
  }

  if (line.startsWith("- ")) {
    while (index < lines.length && lines[index].startsWith("- ")) {
      children.push(new Paragraph({
        text: lines[index].slice(2),
        bullet: { level: 0 },
        spacing: { after: 70 },
      }));
      index += 1;
    }
    continue;
  }

  const paragraphLines = [line.trim()];
  index += 1;
  while (
    index < lines.length
    && lines[index].trim()
    && !/^(#{1,3})\s+/.test(lines[index])
    && !lines[index].startsWith("```")
    && !lines[index].startsWith("- ")
    && !lines[index].startsWith("|")
  ) {
    paragraphLines.push(lines[index].trim());
    index += 1;
  }
  children.push(new Paragraph({
    children: inlineRuns(paragraphLines.join(" ")),
    spacing: { after: 130 },
  }));
}

const document = new Document({
  creator: "Lead Collection",
  title: "Lead Collection - Project Overview",
  description: "Project documentation generated from docs/PROJECT-OVERVIEW.md",
  sections: [{
    properties: {
      page: {
        margin: { top: 720, right: 720, bottom: 720, left: 720 },
      },
    },
    children,
  }],
});

await writeFile(outputPath, await Packer.toBuffer(document));
console.log(`Created ${outputPath.pathname}`);
