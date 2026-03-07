"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  HardDriveDownload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Settings,
  Clock,
} from "lucide-react"
import {
  backupToGoogleSheets,
  getBackupUrl,
  setBackupUrl,
  getLastBackup,
  type BackupProgress,
} from "@/src/services/backup.service"

export function BackupPanel() {
  const [scriptUrl, setScriptUrl] = useState("")
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string; spreadsheetUrl?: string } | null>(null)
  const [lastBackup, setLastBackupState] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showUrlEdit, setShowUrlEdit] = useState(false)

  useEffect(() => {
    const url = getBackupUrl()
    setSavedUrl(url)
    setScriptUrl(url || "")
    setLastBackupState(getLastBackup())
  }, [])

  const handleSaveUrl = () => {
    if (!scriptUrl.trim()) return
    setBackupUrl(scriptUrl.trim())
    setSavedUrl(scriptUrl.trim())
    setShowUrlEdit(false)
  }

  const handleBackup = async () => {
    if (!savedUrl) return
    setIsBackingUp(true)
    setResult(null)
    setProgress(null)

    const res = await backupToGoogleSheets(savedUrl, (p) => setProgress(p))
    setResult(res)
    setIsBackingUp(false)

    if (res.success) {
      setLastBackupState(new Date().toISOString())
    }
  }

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea")
      textarea.value = APPS_SCRIPT_CODE
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configuration
          </CardTitle>
          <CardDescription>
            Connect your Google Sheet to enable backups
          </CardDescription>
        </CardHeader>
        <CardContent>
          {savedUrl && !showUrlEdit ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400 font-medium">Connected</span>
              </div>
              <p className="text-xs text-muted-foreground break-all font-mono bg-muted p-2 rounded">
                {savedUrl}
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowUrlEdit(true)}>
                Change URL
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Google Apps Script Web App URL</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://script.google.com/macros/s/..."
                    value={scriptUrl}
                    onChange={(e) => setScriptUrl(e.target.value)}
                  />
                  <Button onClick={handleSaveUrl} disabled={!scriptUrl.trim()}>
                    Save
                  </Button>
                </div>
              </div>
              {showUrlEdit && (
                <Button variant="ghost" size="sm" onClick={() => { setShowUrlEdit(false); setScriptUrl(savedUrl || "") }}>
                  Cancel
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Don&apos;t have a URL yet? Follow the setup instructions below.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5" />
            Backup Data
          </CardTitle>
          <CardDescription>
            Export all gym data to your Google Sheet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastBackup && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              Last backup: {formatDate(lastBackup)}
            </div>
          )}

          <Button
            onClick={handleBackup}
            disabled={!savedUrl || isBackingUp}
            className="w-full sm:w-auto"
            size="lg"
          >
            {isBackingUp ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Backing up...
              </>
            ) : (
              <>
                <HardDriveDownload className="w-4 h-4 mr-2" />
                Backup Now
              </>
            )}
          </Button>

          {!savedUrl && (
            <p className="text-sm text-muted-foreground">
              Configure your Google Apps Script URL above to enable backups.
            </p>
          )}

          {isBackingUp && progress && (
            <div className="space-y-2">
              <Progress value={progressPercent} />
              <p className="text-sm text-muted-foreground">
                {progress.step} ({progress.current}/{progress.total})
              </p>
            </div>
          )}

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription className="flex flex-col gap-2">
                <span>{result.message}</span>
                {result.success && result.spreadsheetUrl && (
                  <a
                    href={result.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open Google Sheet
                  </a>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Collapsible open={showSetup} onOpenChange={setShowSetup}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                {showSetup ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                Setup Instructions
              </CardTitle>
              <CardDescription>
                How to set up Google Sheets backup (one-time setup)
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Step 1 */}
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Step 1: Create a Google Sheet</h3>
                <p className="text-sm text-muted-foreground">
                  Go to{" "}
                  <a href="https://sheets.new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    sheets.new
                  </a>{" "}
                  to create a new Google Sheet. Name it something like &ldquo;BaCasFitness Backup&rdquo;.
                </p>
              </div>

              {/* Step 2 */}
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Step 2: Open Apps Script</h3>
                <p className="text-sm text-muted-foreground">
                  In your Google Sheet, click <strong>Extensions</strong> &rarr; <strong>Apps Script</strong>.
                </p>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Step 3: Paste the script</h3>
                <p className="text-sm text-muted-foreground">
                  Delete any existing code in the editor and paste the following script:
                </p>
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyScript}
                    className="absolute top-2 right-2 z-10"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto max-h-80 overflow-y-auto">
                    <code>{APPS_SCRIPT_CODE}</code>
                  </pre>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Step 4: Deploy as Web App</h3>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Click <strong>Deploy</strong> &rarr; <strong>New deployment</strong></li>
                  <li>Click the gear icon and select <strong>Web app</strong></li>
                  <li>Set &ldquo;Execute as&rdquo; to <strong>Me</strong></li>
                  <li>Set &ldquo;Who has access&rdquo; to <strong>Anyone</strong></li>
                  <li>Click <strong>Deploy</strong></li>
                  <li>Authorize the script when prompted</li>
                  <li>Copy the <strong>Web app URL</strong></li>
                </ol>
              </div>

              {/* Step 5 */}
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Step 5: Paste the URL</h3>
                <p className="text-sm text-muted-foreground">
                  Paste the copied URL into the configuration section above and click Save.
                </p>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  The backup will create one tab per data table in your Google Sheet. Each backup overwrites the previous data to keep it current.
                </AlertDescription>
              </Alert>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}

const APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: "Error: Script is not bound to a spreadsheet. Open your Google Sheet, go to Extensions > Apps Script, and paste this code there."
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    payload.sheets.forEach(function(sheetData) {
      var sheet = ss.getSheetByName(sheetData.sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetData.sheetName);
      }

      sheet.clear();

      if (sheetData.headers.length > 0) {
        sheet.getRange(1, 1, 1, sheetData.headers.length)
          .setValues([sheetData.headers])
          .setFontWeight("bold")
          .setBackground("#4285f4")
          .setFontColor("#ffffff");
      }

      if (sheetData.rows.length > 0) {
        // Replace null/undefined with empty string for setValues()
        var cleanRows = sheetData.rows.map(function(row) {
          return row.map(function(cell) {
            if (cell === null || cell === undefined) return "";
            return cell;
          });
        });
        var chunkSize = 5000;
        for (var i = 0; i < cleanRows.length; i += chunkSize) {
          var chunk = cleanRows.slice(i, i + chunkSize);
          sheet.getRange(i + 2, 1, chunk.length, sheetData.headers.length)
            .setValues(chunk);
        }
      }

      if (sheetData.headers.length <= 20) {
        sheet.autoResizeColumns(1, sheetData.headers.length);
      }
    });

    // Delete default "Sheet1" if it exists and other sheets were created
    var defaultSheet = ss.getSheetByName("Sheet1");
    if (defaultSheet && ss.getSheets().length > 1) {
      try { ss.deleteSheet(defaultSheet); } catch(e) {}
    }

    // Add/update metadata sheet
    var metaSheet = ss.getSheetByName("_backup_metadata");
    if (!metaSheet) metaSheet = ss.insertSheet("_backup_metadata");
    metaSheet.clear();
    metaSheet.getRange(1, 1, 3, 2).setValues([
      ["Backup Date", payload.metadata.backupDate],
      ["Total Records", payload.metadata.totalRecords],
      ["Source", "BaCasFitness Gym System"]
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: "Backup completed successfully",
        spreadsheetUrl: ss.getUrl(),
        sheetsProcessed: payload.sheets.length,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: "Backup failed: " + error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Run this function manually to test the script works
function testBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log("ERROR: No active spreadsheet. Make sure this script was created from Extensions > Apps Script in your Google Sheet.");
    return;
  }
  var sheet = ss.getSheetByName("_test");
  if (!sheet) sheet = ss.insertSheet("_test");
  sheet.clear();
  sheet.getRange(1, 1, 1, 2).setValues([["Test", "Success"]]);
  Logger.log("SUCCESS: Script is properly connected to: " + ss.getName());
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: "ok",
      message: "BaCasFitness Backup endpoint is active"
    }))
    .setMimeType(ContentService.MimeType.JSON);
}`
