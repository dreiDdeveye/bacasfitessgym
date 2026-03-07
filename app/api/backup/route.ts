import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { scriptUrl, ...payload } = await request.json()

    if (!scriptUrl) {
      return NextResponse.json(
        { success: false, message: "Missing scriptUrl" },
        { status: 400 },
      )
    }

    // Google Apps Script returns a 302 redirect after processing the POST.
    // When fetch follows a 302, it converts POST to GET and drops the body.
    // So we handle the redirect manually to ensure the POST body is sent.
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
      redirect: "manual",
    })

    // Google Apps Script returns 302 redirect to the response URL
    if (response.status === 302) {
      const redirectUrl = response.headers.get("location")
      if (redirectUrl) {
        // Follow the redirect with GET to retrieve the script's response
        const resultResponse = await fetch(redirectUrl)
        const text = await resultResponse.text()
        try {
          const result = JSON.parse(text)
          return NextResponse.json(result)
        } catch {
          // If response isn't JSON, check if it looks like an error page
          if (text.includes("<!DOCTYPE") || text.includes("<html")) {
            return NextResponse.json({
              success: false,
              message: "Google Apps Script returned an error page. Make sure the script is deployed with 'Anyone' access.",
            })
          }
          return NextResponse.json({
            success: true,
            message: "Backup sent successfully",
          })
        }
      }
    }

    // If no redirect (unlikely for GAS), try to read response directly
    const text = await response.text()
    try {
      const result = JSON.parse(text)
      return NextResponse.json(result)
    } catch {
      if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        return NextResponse.json({
          success: false,
          message: "Google Apps Script returned an error page. Check deployment settings.",
        })
      }
      return NextResponse.json({
        success: response.ok,
        message: response.ok
          ? "Backup sent successfully"
          : `Backup failed: HTTP ${response.status}`,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, message: `Backup failed: ${message}` },
      { status: 500 },
    )
  }
}
