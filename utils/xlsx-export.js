/**
 * Club snapshot Excel export utility.
 * Generates .xlsx files with member power data, matching the Google Sheet format.
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getLatestForGuild } = require("../lib/club-store");

const EXPORT_DIR = path.join(__dirname, "..", "data", "club-exports");

// Column definitions
const COLUMNS = [
  { header: "Name", key: "name", width: 22 },
  { header: "SIM Power", key: "sim_power", width: 15 },
  { header: "Total Power", key: "total_power", width: 15 },
  { header: "Change % from last week", key: "change_pct", width: 25 },
];

// Header style: cyan/aqua background, bold white text
const HEADER_BG = "00FFFF";
const HEADER_FONT = { bold: true, color: "FFFFFF" };

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sheetDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Generate a club snapshot .xlsx file.
 *
 * @param {string} guildId - The guild ID
 * @param {Date|string} snapshotAt - The snapshot timestamp
 * @returns {Promise<{filePath: string, fileName: string}>}
 */
async function generateClubExport(guildId, snapshotAt) {
  // Fetch current members from club_latest
  const members = await getLatestForGuild(guildId);

  // Sort by total_power descending
  const sorted = [...members].sort((a, b) => {
    const aVal = a.total_power ?? -Infinity;
    const bVal = b.total_power ?? -Infinity;
    return bVal - aVal;
  });

  // Build data rows
  const rows = sorted.map((m) => {
    const name = m.name_display || m.name_canonical || "";
    const simPower = m.sim_power != null ? Number(m.sim_power) : null;
    const totalPower = m.total_power != null ? Number(m.total_power) : null;
    // total_pct_change is the % change from last week (already computed by recomputeLatestForGuild)
    const changePct =
      m.total_pct_change != null ? Number(m.total_pct_change) : null;

    return { name, sim_power: simPower, total_power: totalPower, change_pct: changePct };
  });

  // Create workbook
  const wb = XLSX.utils.book_new();

  const dateStr = sheetDate(snapshotAt);
  const wsName = dateStr; // tab name = "2026-03-24"

  // Build worksheet data
  // Row 1: headers
  const headerRow = COLUMNS.map((c) => c.header);

  const dataRows = rows.map((r) => [
    r.name,
    r.sim_power,
    r.total_power,
    r.change_pct,
  ]);

  const allRows = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Apply column widths
  ws["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));

  // Style header row (row 1 = index 0 in aoa)
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      fill: { fgColor: { rgb: HEADER_BG } },
      font: HEADER_FONT,
      alignment: { horizontal: "center" },
    };
  }

  // Format data cells
  // Number columns (B=1, C=2): comma-separated integers
  // Change column (D=3): percentage format +0.0%;-0.0%
  for (let rowIdx = 1; rowIdx <= range.e.r; rowIdx++) {
    // B column: SIM Power
    const bCell = XLSX.utils.encode_cell({ r: rowIdx, c: 1 });
    if (ws[bCell] && ws[bCell].t === "n") {
      ws[bCell].z = "#,##0";
    }

    // C column: Total Power
    const cCell = XLSX.utils.encode_cell({ r: rowIdx, c: 2 });
    if (ws[cCell] && ws[cCell].t === "n") {
      ws[cCell].z = "#,##0";
    }

    // D column: Change %
    const dCell = XLSX.utils.encode_cell({ r: rowIdx, c: 3 });
    if (ws[dCell] && ws[dCell].t === "n") {
      ws[dCell].z = "+0.0%;-0.0%";
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, wsName);

  // Ensure export dir exists
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const fileName = `club-snapshot-${dateStr}.xlsx`;
  const filePath = path.join(EXPORT_DIR, fileName);

  XLSX.writeFile(wb, filePath);

  return { filePath, fileName };
}

module.exports = { generateClubExport };
