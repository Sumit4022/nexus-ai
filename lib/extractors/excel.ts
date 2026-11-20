
import ExcelJS from "exceljs";

const MAX_ROWS = 500;
const MAX_COLUMNS = 50;
const MAX_CELL_CHARS = 2000;

type ExcelCellValue = ExcelJS.CellValue;

function normalizeCellValue(value: ExcelCellValue): string {
    if (value === null || value === undefined) {
        return "";
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === "object") {
        if ("text" in value && typeof value.text === "string") {
            return value.text;
        }

        if ("result" in value) {
            return String(value.result ?? "");
        }

        if ("richText" in value && Array.isArray(value.richText)) {
            return value.richText
                .map((item) => item.text)
                .join("");
        }

        return JSON.stringify(value);
    }

    return String(value);
}

export async function extractExcelContent(
    buffer: Buffer
): Promise<string> {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(buffer as never);

    const output: string[] = [];

    for (const worksheet of workbook.worksheets) {
        output.push(`## Worksheet: ${worksheet.name}`);
        output.push("");

        const rowCount = Math.min(
            worksheet.rowCount,
            MAX_ROWS
        );

        const columnCount = Math.min(
            worksheet.columnCount,
            MAX_COLUMNS
        );

        for (let rowNumber = 1; rowNumber <= rowCount; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const cells: string[] = [];

            for (
                let columnNumber = 1;
                columnNumber <= columnCount;
                columnNumber++
            ) {
                const cell = row.getCell(columnNumber);

                const value = normalizeCellValue(cell.value)
                    .slice(0, MAX_CELL_CHARS);

                cells.push(value);
            }

            if (cells.some((cell) => cell.trim() !== "")) {
                output.push(cells.join(" | "));
            }
        }

        if (worksheet.rowCount > MAX_ROWS) {
            output.push(
                `[Worksheet truncated: only the first ${MAX_ROWS} rows were extracted.]`
            );
        }

        if (worksheet.columnCount > MAX_COLUMNS) {
            output.push(
                `[Worksheet truncated: only the first ${MAX_COLUMNS} columns were extracted.]`
            );
        }

        output.push("");
    }

    const result = output.join("\n").trim();

    if (!result) {
        throw new Error(
            "The Excel file contains no readable worksheet data."
        );
    }

    return result;
}
