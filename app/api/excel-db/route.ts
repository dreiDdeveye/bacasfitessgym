import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import * as XLSX from "xlsx"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Row = Record<string, unknown>

type TableName =
  | "users"
  | "subscriptions"
  | "medical_history"
  | "emergency_contacts"
  | "liability_waivers"
  | "scan_logs"
  | "active_sessions"
  | "subscription_history"
  | "user_id_counter"
  | "payment"

const tableNames = [
  "users",
  "subscriptions",
  "medical_history",
  "emergency_contacts",
  "liability_waivers",
  "scan_logs",
  "active_sessions",
  "subscription_history",
  "user_id_counter",
  "payment",
] as const

interface TableConfig {
  sheetName: string
  primaryKey: string
  columns: string[]
  seedRows?: Row[]
}

const tableConfigs: Record<TableName, TableConfig> = {
  users: {
    sheetName: "Users",
    primaryKey: "user_id",
    columns: [
      "user_id",
      "name",
      "email",
      "phone",
      "birthday",
      "age",
      "address",
      "goal",
      "program_type",
      "height_cm",
      "weight_kg",
      "created_at",
      "updated_at",
    ],
  },
  subscriptions: {
    sheetName: "Subscriptions",
    primaryKey: "user_id",
    columns: [
      "user_id",
      "start_date",
      "end_date",
      "status",
      "plan_duration",
      "membership_type",
      "coaching_preference",
      "payment_status",
      "payment_date",
      "created_at",
    ],
  },
  medical_history: {
    sheetName: "Medical History",
    primaryKey: "user_id",
    columns: [
      "user_id",
      "heart_problems",
      "blood_pressure_problems",
      "chest_pain_exercising",
      "asthma_breathing_problems",
      "joint_problems",
      "neck_back_problems",
      "pregnant_recent_birth",
      "other_medical_conditions",
      "other_medical_details",
      "smoking",
      "medication",
      "medication_details",
      "created_at",
      "updated_at",
    ],
  },
  emergency_contacts: {
    sheetName: "Emergency Contacts",
    primaryKey: "user_id",
    columns: ["user_id", "contact_name", "contact_number", "created_at", "updated_at"],
  },
  liability_waivers: {
    sheetName: "Liability Waivers",
    primaryKey: "user_id",
    columns: ["user_id", "signature_name", "signed_date", "waiver_accepted", "created_at"],
  },
  scan_logs: {
    sheetName: "Scan Logs",
    primaryKey: "id",
    columns: ["id", "user_id", "user_name", "timestamp", "action", "status"],
  },
  active_sessions: {
    sheetName: "Active Sessions",
    primaryKey: "user_id",
    columns: ["user_id", "user_name", "check_in_time"],
  },
  subscription_history: {
    sheetName: "Subscription History",
    primaryKey: "id",
    columns: ["id", "user_id", "start_date", "end_date", "status", "created_at", "updated_at"],
  },
  user_id_counter: {
    sheetName: "User ID Counter",
    primaryKey: "id",
    columns: ["id", "last_number"],
    seedRows: [{ id: 1, last_number: 1000 }],
  },
  payment: {
    sheetName: "Payments",
    primaryKey: "payment_id",
    columns: [
      "payment_id",
      "user_id",
      "amount",
      "payment_method",
      "payment_date",
      "reference_number",
      "notes",
      "payment_for",
      "created_at",
      "updated_at",
    ],
  },
}

const databasePath =
  process.env.EXCEL_DATABASE_PATH ||
  path.join(process.cwd(), "data", "bacas-database.xlsx")
const googleSheetsDbUrl =
  process.env.GOOGLE_SHEETS_DB_URL ||
  process.env.NEXT_PUBLIC_GOOGLE_SHEETS_DB_URL ||
  "https://script.google.com/macros/s/AKfycbzuEZSHMlQnaV8NU2rQRCDZyEEB_pQSno-sNj6w20vFg4GoG6eNZF6hSOYv3fpDXzFF/exec"
const remoteReadCacheTtlMs = Number(process.env.GOOGLE_SHEETS_CACHE_TTL_MS || 30_000)

let operationLock = Promise.resolve()
const remoteReadCache = new Map<string, { expiresAt: number; data: unknown }>()

function withLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = operationLock.then(operation, operation)
  operationLock = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function ensureWorkbook(): XLSX.WorkBook {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  if (fs.existsSync(databasePath)) {
    const workbook = XLSX.read(fs.readFileSync(databasePath), {
      cellDates: false,
      type: "buffer",
    })
    let changed = false

    for (const table of Object.values(tableConfigs)) {
      if (!workbook.Sheets[table.sheetName]) {
        const rows = table.seedRows || []
        workbook.Sheets[table.sheetName] = rowsToSheet(table, rows)
        workbook.SheetNames.push(table.sheetName)
        changed = true
      }
    }

    if (changed) writeWorkbook(workbook)
    return workbook
  }

  const workbook = XLSX.utils.book_new()
  for (const table of Object.values(tableConfigs)) {
    XLSX.utils.book_append_sheet(
      workbook,
      rowsToSheet(table, table.seedRows || []),
      table.sheetName,
    )
  }
  writeWorkbook(workbook)
  return workbook
}

function writeWorkbook(workbook: XLSX.WorkBook): void {
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
  fs.writeFileSync(databasePath, buffer)
}

function rowsToSheet(table: TableConfig, rows: Row[]): XLSX.WorkSheet {
  const extraColumns = rows.flatMap((row) =>
    Object.keys(row).filter((key) => !table.columns.includes(key)),
  )
  const headers = [...table.columns, ...Array.from(new Set(extraColumns))]
  const values = rows.map((row) => headers.map((header) => row[header] ?? null))
  return XLSX.utils.aoa_to_sheet([headers, ...values])
}

function getRows(workbook: XLSX.WorkBook, table: TableConfig): Row[] {
  const sheet = workbook.Sheets[table.sheetName]
  if (!sheet) return table.seedRows || []

  return XLSX.utils.sheet_to_json<Row>(sheet, {
    defval: null,
    raw: false,
  })
}

function saveRows(workbook: XLSX.WorkBook, table: TableConfig, rows: Row[]): void {
  workbook.Sheets[table.sheetName] = rowsToSheet(table, rows)
  writeWorkbook(workbook)
}

function sameValue(left: unknown, right: unknown): boolean {
  return String(left ?? "") === String(right ?? "")
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function asTableName(value: unknown): TableName | null {
  if (typeof value !== "string") return null
  return value in tableConfigs ? (value as TableName) : null
}

function asTableNames(value: unknown): TableName[] {
  if (!Array.isArray(value)) return [...tableNames]
  const names = value.map(asTableName).filter((name): name is TableName => !!name)
  return names.length ? names : [...tableNames]
}

function canUseGoogleSheets(): boolean {
  return !!googleSheetsDbUrl
}

function normalizeRemoteRows(data: unknown): Row[] | null {
  if (!Array.isArray(data)) return null
  return data.filter((row): row is Row => !!row && typeof row === "object" && !Array.isArray(row))
}

function normalizeRemoteRow(data: unknown): Row | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  return data as Row
}

function getCachedRemoteRead<T>(key: string): T | null {
  const cached = remoteReadCache.get(key)
  if (!cached || cached.expiresAt < Date.now()) {
    remoteReadCache.delete(key)
    return null
  }
  return cached.data as T
}

function setCachedRemoteRead(key: string, data: unknown): void {
  if (remoteReadCacheTtlMs <= 0) return
  remoteReadCache.set(key, {
    data,
    expiresAt: Date.now() + remoteReadCacheTtlMs,
  })
}

function clearRemoteReadCache(): void {
  remoteReadCache.clear()
}

async function googleSheetsRequest(
  table: TableName,
  action: "list" | "get" | "insert" | "update" | "delete",
  payload: Record<string, unknown> = {},
): Promise<{ handled: boolean; data?: unknown; deleted?: number; message?: string }> {
  if (!canUseGoogleSheets()) return { handled: false }

  try {
    if (action === "list" || action === "get") {
      const url = new URL(googleSheetsDbUrl)
      url.searchParams.set("action", action)
      url.searchParams.set("table", table)
      if (payload.id !== undefined) url.searchParams.set("id", String(payload.id))

      const cacheKey = url.toString()
      const cached = getCachedRemoteRead<unknown>(cacheKey)
      if (cached !== null) return { handled: true, data: cached }

      const response = await fetch(url, { cache: "no-store", redirect: "follow" })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        return {
          handled: false,
          message: result?.message || `Google Sheets ${action} failed for ${table}`,
        }
      }
      if (action === "list") {
        const rows = normalizeRemoteRows(result.data)
        if (!rows) return { handled: false }
        setCachedRemoteRead(cacheKey, rows)
        return { handled: true, data: rows, message: result.message }
      }

      const row = normalizeRemoteRow(result.data)
      setCachedRemoteRead(cacheKey, row)
      return {
        handled: true,
        data: row,
        message: result.message,
      }
    }

    const response = await fetch(googleSheetsDbUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ table, action, ...payload }),
      redirect: "follow",
      cache: "no-store",
    })
    const result = await response.json().catch(() => null)

    if (!response.ok || !result?.success) {
      return {
        handled: false,
        message: result?.message || `Google Sheets ${action} failed for ${table}`,
      }
    }
    clearRemoteReadCache()
    return {
      handled: true,
      data: result.data,
      deleted: result.deleted,
      message: result.message,
    }
  } catch (error) {
    console.warn("Google Sheets database request failed, falling back to local Excel:", error)
    return {
      handled: false,
      message: error instanceof Error ? error.message : `Google Sheets ${action} failed for ${table}`,
    }
  }
}

async function googleSheetsBatchRequest(
  requestedTables: TableName[],
): Promise<{ handled: boolean; data?: Record<TableName, Row[]>; message?: string }> {
  if (!canUseGoogleSheets()) return { handled: false }

  const cacheKey = `batch:${requestedTables.join(",")}`
  const cached = getCachedRemoteRead<Record<TableName, Row[]>>(cacheKey)
  if (cached) return { handled: true, data: cached }

  try {
    const url = new URL(googleSheetsDbUrl)
    url.searchParams.set("action", "batch")
    url.searchParams.set("tables", requestedTables.join(","))

    const response = await fetch(url, { cache: "no-store", redirect: "follow" })
    const result = await response.json().catch(() => null)

    if (response.ok && result?.success && result.data && typeof result.data === "object") {
      const data = {} as Record<TableName, Row[]>
      for (const table of requestedTables) data[table] = normalizeRemoteRows(result.data[table]) || []
      setCachedRemoteRead(cacheKey, data)
      for (const [table, rows] of Object.entries(data)) {
        setCachedRemoteRead(`${googleSheetsDbUrl}?action=list&table=${table}`, rows)
      }
      return { handled: true, data, message: result.message }
    }

    const entries = await Promise.all(
      requestedTables.map(async (table) => {
        const remote = await googleSheetsRequest(table, "list")
        return [table, normalizeRemoteRows(remote.data) || []] as const
      }),
    )
    const data = Object.fromEntries(entries) as Record<TableName, Row[]>
    setCachedRemoteRead(cacheKey, data)
    return { handled: true, data }
  } catch (error) {
    console.warn("Google Sheets batch request failed, falling back to local Excel:", error)
    return { handled: false }
  }
}

function getLocalBatchRows(workbook: XLSX.WorkBook, requestedTables: TableName[]) {
  const data = {} as Record<TableName, Row[]>
  for (const tableName of requestedTables) {
    data[tableName] = getRows(workbook, tableConfigs[tableName])
  }
  return data
}

export async function POST(request: NextRequest) {
  return withLock(async () => {
    try {
      const body = await request.json()
      const tableName = asTableName(body.table)
      const action = body.action as string | undefined

      if (action === "batchList") {
        const requestedTables = asTableNames(body.tables)

        if (body.preferLocal !== true) {
          const remote = await googleSheetsBatchRequest(requestedTables)
          if (remote.handled) {
            return NextResponse.json({
              success: true,
              data: remote.data,
              source: "google-sheets",
              message: remote.message,
            })
          }
        }

        const workbook = ensureWorkbook()
        return NextResponse.json({
          success: true,
          data: getLocalBatchRows(workbook, requestedTables),
          databasePath,
          source: "local-excel",
        })
      }

      if (!tableName || !action) {
        return NextResponse.json(
          { success: false, message: "Missing or invalid table/action" },
          { status: 400 },
        )
      }

      const table = tableConfigs[tableName]

      if (body.preferLocal !== true) {
        const remote = await googleSheetsRequest(tableName, action as any, {
          id: body.id,
          row: body.row,
          rows: body.rows,
          updates: body.updates,
        })

        if (remote.handled) {
          return NextResponse.json({
            success: true,
            data: remote.data,
            deleted: remote.deleted,
            source: "google-sheets",
            message: remote.message,
          })
        }

        if (canUseGoogleSheets() && ["insert", "update", "delete"].includes(action)) {
          return NextResponse.json(
            {
              success: false,
              message: remote.message || `Google Sheets rejected ${tableName}.${action}. Local fallback was skipped to avoid split data.`,
              source: "google-sheets",
            },
            { status: 502 },
          )
        }
      }

      const workbook = ensureWorkbook()
      const rows = getRows(workbook, table)

      if (action === "list") {
        return NextResponse.json({ success: true, data: rows, databasePath, source: "local-excel" })
      }

      if (action === "get") {
        const row = rows.find((item) => sameValue(item[table.primaryKey], body.id)) || null
        return NextResponse.json({ success: true, data: row, databasePath, source: "local-excel" })
      }

      if (action === "insert") {
        const incomingRows = Array.isArray(body.rows) ? body.rows : [body.row]
        const inserted = incomingRows.map((row: Row) => {
          const nextRow = { ...row }
          if (!nextRow[table.primaryKey]) nextRow[table.primaryKey] = createId()
          rows.push(nextRow)
          return nextRow
        })
        saveRows(workbook, table, rows)
        return NextResponse.json({ success: true, data: inserted, databasePath, source: "local-excel" })
      }

      if (action === "update") {
        const id = body.id
        let updated: Row | null = null
        const nextRows = rows.map((row) => {
          if (!sameValue(row[table.primaryKey], id)) return row
          updated = { ...row, ...body.updates }
          return updated as Row
        })
        saveRows(workbook, table, nextRows)
        return NextResponse.json({ success: true, data: updated, databasePath, source: "local-excel" })
      }

      if (action === "delete") {
        const id = body.id
        const nextRows = rows.filter((row) => !sameValue(row[table.primaryKey], id))
        saveRows(workbook, table, nextRows)
        return NextResponse.json({
          success: true,
          deleted: rows.length - nextRows.length,
          databasePath,
          source: "local-excel",
        })
      }

      return NextResponse.json(
        { success: false, message: `Unsupported action: ${action}` },
        { status: 400 },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return NextResponse.json(
        { success: false, message: `Excel database error: ${message}` },
        { status: 500 },
      )
    }
  })
}
