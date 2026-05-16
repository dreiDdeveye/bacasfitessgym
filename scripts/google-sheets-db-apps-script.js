/**
 * BaCasFitness Google Sheets database endpoint.
 *
 * Paste this whole file into the bound Apps Script project for your Google
 * Sheet, then deploy a new Web App version with access set to "Anyone".
 */

var DB_VERSION = "2026-05-16-active-sessions-tab";

/**
 * Optional but recommended for standalone Apps Script deployments.
 *
 * If the script is not opened from the target Google Sheet via
 * Extensions > Apps Script, paste the spreadsheet ID here. The ID is the long
 * value between /d/ and /edit in the Google Sheets URL.
 */
var SPREADSHEET_ID = "1GqMS5tfUtrL7M5-3jEnlR-RdMyG5ntMS8ANt0Zqquug";

var TABLES = {
  users: {
    sheetName: "user_rows",
    sheetAliases: ["users_rows", "Users"],
    primaryKey: "user_id",
    columns: [
      ["user_id", "User ID"],
      ["name", "Name"],
      ["email", "Email"],
      ["phone", "Phone"],
      ["birthday", "Birthday"],
      ["age", "Age"],
      ["address", "Address"],
      ["goal", "Goal"],
      ["program_type", "Program Type"],
      ["height_cm", "Height (cm)"],
      ["weight_kg", "Weight (kg)"],
      ["created_at", "Created At"],
      ["updated_at", "Updated At"],
    ],
  },
  subscriptions: {
    sheetName: "subscription_rows",
    sheetAliases: ["subscriptions_rows", "Subscriptions"],
    primaryKey: "user_id",
    columns: [
      ["user_id", "User ID"],
      ["start_date", "Start Date"],
      ["end_date", "End Date"],
      ["status", "Status"],
      ["plan_duration", "Plan Duration"],
      ["membership_type", "Membership Type"],
      ["coaching_preference", "Coaching Preference"],
      ["payment_status", "Payment Status"],
      ["payment_date", "Payment Date"],
      ["created_at", "Created At"],
    ],
  },
  subscription_history: {
    sheetName: "subscription_history_rows",
    sheetAliases: ["Subscription History"],
    primaryKey: "id",
    columns: [
      ["id", "ID"],
      ["user_id", "User ID"],
      ["start_date", "Start Date"],
      ["end_date", "End Date"],
      ["status", "Status"],
      ["created_at", "Created At"],
      ["updated_at", "Updated At"],
    ],
  },
  scan_logs: {
    sheetName: "scan_logs_rows",
    sheetAliases: ["Scan Logs"],
    primaryKey: "id",
    columns: [
      ["id", "ID"],
      ["user_id", "User ID"],
      ["user_name", "User Name"],
      ["timestamp", "Timestamp"],
      ["action", "Action"],
      ["status", "Status"],
    ],
  },
  active_sessions: {
    sheetName: "Active Sessions",
    sheetAliases: ["active_sessions_rows"],
    primaryKey: "user_id",
    columns: [
      ["user_id", "User ID"],
      ["user_name", "User Name"],
      ["check_in_time", "Check-in Time"],
    ],
  },
  medical_history: {
    sheetName: "medical_history_rows",
    sheetAliases: ["Medical History"],
    primaryKey: "user_id",
    columns: [
      ["user_id", "User ID"],
      ["heart_problems", "Heart Problems"],
      ["blood_pressure_problems", "Blood Pressure"],
      ["chest_pain_exercising", "Chest Pain"],
      ["asthma_breathing_problems", "Asthma/Breathing"],
      ["joint_problems", "Joint Problems"],
      ["neck_back_problems", "Neck/Back"],
      ["pregnant_recent_birth", "Pregnant/Recent Birth"],
      ["other_medical_conditions", "Other Conditions"],
      ["other_medical_details", "Other Details"],
      ["smoking", "Smoking"],
      ["medication", "Medication"],
      ["medication_details", "Medication Details"],
      ["created_at", "Created At"],
      ["updated_at", "Updated At"],
    ],
  },
  emergency_contacts: {
    sheetName: "emergency_contacts_rows",
    sheetAliases: ["Emergency Contacts"],
    primaryKey: "user_id",
    columns: [
      ["user_id", "User ID"],
      ["contact_name", "Contact Name"],
      ["contact_number", "Contact Number"],
      ["created_at", "Created At"],
      ["updated_at", "Updated At"],
    ],
  },
  liability_waivers: {
    sheetName: "liability_waivers_rows",
    sheetAliases: ["Liability Waivers"],
    primaryKey: "user_id",
    columns: [
      ["user_id", "User ID"],
      ["signature_name", "Signature Name"],
      ["signed_date", "Signed Date"],
      ["waiver_accepted", "Waiver Accepted"],
      ["created_at", "Created At"],
    ],
  },
  user_id_counter: {
    sheetName: "user_id_rows",
    sheetAliases: ["user_id_counter_rows", "User ID Counter"],
    primaryKey: "id",
    columns: [
      ["id", "ID"],
      ["last_number", "Last Number"],
    ],
    seedRows: [{ id: 1, last_number: 1000 }],
  },
  payment: {
    sheetName: "payments_rows",
    sheetAliases: ["payment_rows", "Payments"],
    primaryKey: "payment_id",
    columns: [
      ["payment_id", "Payment ID"],
      ["user_id", "User ID"],
      ["member_name", "Member Name"],
      ["amount", "Amount"],
      ["payment_method", "Payment Method"],
      ["payment_date", "Payment Date"],
      ["payment_for", "Payment For"],
      ["reference_number", "Reference Number"],
      ["notes", "Notes"],
      ["created_at", "Created At"],
      ["updated_at", "Updated At"],
    ],
  },
};

function doGet(e) {
  try {
    var action = String((e.parameter.action || "status")).toLowerCase();

    if (action === "status") {
      var statusSpreadsheet = getSpreadsheet();
      return json({
        success: true,
        status: "ok",
        version: DB_VERSION,
        spreadsheetId: statusSpreadsheet ? statusSpreadsheet.getId() : null,
        spreadsheetName: statusSpreadsheet ? statusSpreadsheet.getName() : null,
        tables: Object.keys(TABLES),
        message: "BaCasFitness database endpoint is active",
      });
    }

    if (action === "init") {
      var initializedTables = initializeTables();
      return json({
        success: true,
        status: "ok",
        version: DB_VERSION,
        tables: initializedTables,
        message: "Database sheets initialized successfully",
      });
    }

    if (action === "debug") {
      return json({
        success: true,
        status: "ok",
        version: DB_VERSION,
        spreadsheet: getSpreadsheetDebugInfo(),
        tables: getTablesDebugInfo(),
      });
    }

    if (action === "batch") {
      var batchTables = getRequestedTables(e.parameter.tables);
      var batchData = {};

      for (var batchIndex = 0; batchIndex < batchTables.length; batchIndex++) {
        var batchTableName = batchTables[batchIndex];
        var batchTable = getTable(batchTableName);
        batchData[batchTableName] = readRows(ensureSheet(batchTable), batchTable);
      }

      return json({ success: true, data: batchData });
    }

    var table = getTable(e.parameter.table || e.parameter.type);
    var sheet = ensureSheet(table);

    if (action === "list" || action === "get") {
      var rows = readRows(sheet, table);

      if (action === "get") {
        var found = null;
        for (var i = 0; i < rows.length; i++) {
          if (sameValue(rows[i][table.primaryKey], e.parameter.id)) {
            found = rows[i];
            break;
          }
        }
        return json({ success: true, data: found });
      }

      return json({ success: true, data: rows });
    }

    return json({ success: false, message: "Unsupported GET action: " + action });
  } catch (error) {
    return json({ success: false, message: errorMessage(error) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var payload = JSON.parse(e.postData.contents || "{}");
    var ss = getSpreadsheet();

    if (!ss) {
      return json({
        success: false,
        message: "Error: Script is not connected to a spreadsheet. Open your Google Sheet, go to Extensions > Apps Script, or set SPREADSHEET_ID in this script.",
      });
    }

    var table = getTable(payload.table);
    var sheet = ensureSheet(table);
    var action = String(payload.action || "").toLowerCase();

    if (action === "insert") {
      var incomingRows = payload.rows && payload.rows.map ? payload.rows : [payload.row];
      var inserted = [];

      for (var i = 0; i < incomingRows.length; i++) {
        if (incomingRows[i]) inserted.push(appendRow(sheet, table, incomingRows[i]));
      }

      return json({ success: true, data: inserted });
    }

    if (action === "update") {
      return json({ success: true, data: updateRow(sheet, table, payload.id, payload.updates || {}) });
    }

    if (action === "delete") {
      return json({ success: true, deleted: deleteRow(sheet, table, payload.id) });
    }

    return json({ success: false, message: "Unsupported POST action: " + action });
  } catch (error) {
    return json({ success: false, message: errorMessage(error) });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {}
  }
}

function getTable(tableName) {
  var table = TABLES[String(tableName || "")];
  if (!table) throw new Error("Invalid table: " + tableName);
  return table;
}

function getRequestedTables(rawTables) {
  if (!rawTables) return Object.keys(TABLES);

  var requested = String(rawTables).split(",");
  var valid = [];

  for (var i = 0; i < requested.length; i++) {
    var tableName = requested[i].trim();
    if (TABLES[tableName]) valid.push(tableName);
  }

  return valid.length ? valid : Object.keys(TABLES);
}

function ensureSheet(table) {
  var ss = getSpreadsheet();
  if (!ss) throw new Error("Script is not connected to a spreadsheet.");

  var sheet = getSheetForTable(ss, table);
  if (!sheet) sheet = ss.insertSheet(table.sheetName);

  if (sheet.getLastColumn() === 0 || getHeaders(sheet).length === 0) {
    sheet.getRange(1, 1, 1, table.columns.length).setValues([table.columns.map(function(column) {
      return column[1];
    })]);
    sheet.getRange(1, 1, 1, table.columns.length)
      .setFontWeight("bold")
      .setBackground(getHeaderColor(table.sheetName))
      .setFontColor("#ffffff");

    if (table.seedRows) {
      table.seedRows.forEach(function(row) {
        appendRow(sheet, table, row);
      });
    }
  } else {
    ensureColumns(sheet, table);

    if (table.seedRows && readRows(sheet, table).length === 0) {
      table.seedRows.forEach(function(row) {
        appendRow(sheet, table, row);
      });
    }
  }

  return sheet;
}

function getSheetForTable(ss, table) {
  var names = [table.sheetName].concat(table.sheetAliases || []);
  var bestSheet = null;
  var allSheets = ss.getSheets();

  for (var i = 0; i < names.length; i++) {
    var sheet = findSheetByName(allSheets, names[i]);
    if (!sheet) continue;
    if (!bestSheet || sheet.getLastRow() > bestSheet.getLastRow()) {
      bestSheet = sheet;
    }
  }

  return bestSheet;
}

function findSheetByName(sheets, name) {
  var normalizedName = normalizeSheetName(name);
  for (var i = 0; i < sheets.length; i++) {
    if (normalizeSheetName(sheets[i].getName()) === normalizedName) return sheets[i];
  }
  return null;
}

function normalizeSheetName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function initializeTables() {
  var initialized = [];
  Object.keys(TABLES).forEach(function(tableName) {
    var table = TABLES[tableName];
    ensureSheet(table);
    initialized.push(tableName);
  });
  return initialized;
}

function ensureColumns(sheet, table) {
  var headers = getHeaders(sheet);
  var existing = {};

  headers.forEach(function(header) {
    existing[keyForHeader(table, header)] = true;
  });

  var missingHeaders = [];
  table.columns.forEach(function(column) {
    if (!existing[column[0]]) missingHeaders.push(column[1]);
  });

  if (missingHeaders.length === 0) return;

  sheet.getRange(1, headers.length + 1, 1, missingHeaders.length)
    .setValues([missingHeaders])
    .setFontWeight("bold")
    .setBackground(getHeaderColor(table.sheetName))
    .setFontColor("#ffffff");
}

function getHeaders(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
    return String(header || "").trim();
  });
}

function headerAliases(table) {
  var aliases = {};
  table.columns.forEach(function(column) {
    aliases[normalizeHeader(column[0])] = column[0];
    aliases[normalizeHeader(column[1])] = column[0];
  });
  return aliases;
}

function keyForHeader(table, header) {
  return headerAliases(table)[normalizeHeader(header)] || normalizeHeader(header);
}

function readRows(sheet, table) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0].map(function(header) {
    return String(header || "").trim();
  });

  var rows = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    var sourceRow = values[rowIndex];
    var hasValue = sourceRow.some(function(cell) {
      return cell !== "";
    });
    if (!hasValue) continue;

    var item = {};
    for (var columnIndex = 0; columnIndex < headers.length; columnIndex++) {
      item[keyForHeader(table, headers[columnIndex])] = normalizeCell(sourceRow[columnIndex]);
    }
    rows.push(item);
  }

  return rows;
}

function appendRow(sheet, table, row) {
  var headers = getHeaders(sheet);
  var nextRow = {};

  for (var key in row) {
    if (Object.prototype.hasOwnProperty.call(row, key)) nextRow[key] = row[key];
  }

  if (!nextRow[table.primaryKey]) {
    nextRow[table.primaryKey] = String(new Date().getTime()) + "-" + Math.random().toString(36).slice(2, 10);
  }

  var values = headers.map(function(header) {
    var value = nextRow[keyForHeader(table, header)];
    return value === null || value === undefined ? "" : value;
  });

  sheet.appendRow(values);
  return nextRow;
}

function updateRow(sheet, table, id, updates) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return null;

  var headers = values[0].map(function(header) {
    return String(header || "").trim();
  });
  var primaryIndex = findPrimaryIndex(headers, table);

  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (!sameValue(values[rowIndex][primaryIndex], id)) continue;

    for (var columnIndex = 0; columnIndex < headers.length; columnIndex++) {
      var key = keyForHeader(table, headers[columnIndex]);
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        sheet.getRange(rowIndex + 1, columnIndex + 1).setValue(updates[key] === null ? "" : updates[key]);
      }
    }

    return readRows(sheet, table)[rowIndex - 1] || null;
  }

  return null;
}

function deleteRow(sheet, table, id) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return 0;

  var headers = values[0].map(function(header) {
    return String(header || "").trim();
  });
  var primaryIndex = findPrimaryIndex(headers, table);

  for (var rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    if (sameValue(values[rowIndex][primaryIndex], id)) {
      sheet.deleteRow(rowIndex + 1);
      return 1;
    }
  }

  return 0;
}

function findPrimaryIndex(headers, table) {
  for (var i = 0; i < headers.length; i++) {
    if (keyForHeader(table, headers[i]) === table.primaryKey) return i;
  }
  throw new Error("Primary key column not found for " + table.sheetName);
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCell(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }
  return value === "" ? null : value;
}

function sameValue(left, right) {
  return String(left === null || left === undefined ? "" : left) ===
    String(right === null || right === undefined ? "" : right);
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorMessage(error) {
  return String(error && error.message ? error.message : error);
}

function getHeaderColor(sheetName) {
  var colors = {
    "Users": "#4285f4",
    "Subscriptions": "#0f9d58",
    "Payments": "#e67e22",
    "Scan Logs": "#9b59b6",
    "Active Sessions": "#1abc9c",
    "Subscription History": "#2980b9",
    "Medical History": "#e74c3c",
    "Emergency Contacts": "#f39c12",
    "Liability Waivers": "#7f8c8d",
    "User ID Counter": "#34495e",
  };
  return colors[sheetName] || "#4285f4";
}

function getSpreadsheet() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSpreadsheetDebugInfo() {
  var ss = getSpreadsheet();
  if (!ss) return null;

  return {
    id: ss.getId(),
    name: ss.getName(),
    sheets: ss.getSheets().map(function(sheet) {
      return {
        name: sheet.getName(),
        lastRow: sheet.getLastRow(),
        lastColumn: sheet.getLastColumn(),
      };
    }),
  };
}

function getTablesDebugInfo() {
  var ss = getSpreadsheet();
  var info = {};

  Object.keys(TABLES).forEach(function(tableName) {
    var table = TABLES[tableName];
    var sheet = getSheetForTable(ss, table);
    var headers = sheet ? getHeaders(sheet) : [];

    info[tableName] = {
      expectedSheet: table.sheetName,
      aliases: table.sheetAliases || [],
      selectedSheet: sheet ? sheet.getName() : null,
      lastRow: sheet ? sheet.getLastRow() : 0,
      lastColumn: sheet ? sheet.getLastColumn() : 0,
      headers: headers,
      normalizedHeaders: headers.map(function(header) {
        return keyForHeader(table, header);
      }),
      rowCount: sheet ? readRows(sheet, table).length : 0,
    };
  });

  return info;
}

function testDatabaseConnection() {
  var ss = getSpreadsheet();
  if (!ss) {
    Logger.log("ERROR: No spreadsheet connection. Create the script from Extensions > Apps Script in your Google Sheet, or set SPREADSHEET_ID.");
    return;
  }
  var sheet = ss.getSheetByName("_test");
  if (!sheet) sheet = ss.insertSheet("_test");
  sheet.clear();
  sheet.getRange(1, 1, 1, 2).setValues([["Test", "Success"]]);
  Logger.log("SUCCESS: Script is properly connected to: " + ss.getName());
}
