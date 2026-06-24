import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/parse-receipt-text
 *
 * Takes raw OCR text from a receipt and sends it to Gemini
 * for structured item extraction. This is much more reliable
 * than regex parsing for multi-line, multi-column receipts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const text: string | undefined = body?.text;

  if (!text || typeof text !== "string" || text.trim().length < 10) {
    return NextResponse.json({ error: "Missing or too short receipt text" }, { status: 400 });
  }

  // Try Gemini key first, fall back to Vision key
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_VISION_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `You are a receipt parser. Below is raw OCR text from a Malaysian restaurant receipt. The text may be messy — items might be split across multiple lines, item codes (like "U7", "N21", "G1") may appear before names, modifiers like ": Soba" or ": Cold" describe the item above them, and quantities/prices may be on separate lines from item names.

Your job: extract ALL food/drink line items with their correct names, quantities, and prices.

Return ONLY a valid JSON object with this exact structure:
{
  "items": [
    { "name": "Item Name", "quantity": 1, "price": 12.90 }
  ],
  "serviceCharge": 0,
  "sst": 0,
  "rounding": 0,
  "receiptTotal": 0
}

Rules:
- "name": the item name (combine multi-line names and modifiers, e.g. "Tenzaru" + ": Soba" = "Tenzaru Soba"). Strip item codes like "U7", "N21", "G1", "B19" from the name.
- "quantity": the quantity ordered (default 1). Watch for quantities next to prices (e.g., "1 RM16.90" means quantity 1) or standalone lines with just a number.
- "price": the TOTAL price for that line as a number. This is qty × unit price. Use the RM amount shown.
- CRITICAL: Because this is raw OCR text, the price and quantity might appear on the line *above* or *below* the item name (e.g. "1 RM16.90" on one line, "07 Tenzaru" on the next line). You MUST logically match the price and quantity to the correct food item based on context!
- Skip items with price 0.00 or free items
- "serviceCharge": the service charge amount (if any, look for "Service Charge")
- "sst": SST / government tax amount (if any, look for "Gov Service Tax" or "SST")
- "rounding": rounding adjustment (positive or negative, e.g. 0.02 or -0.02)
- "receiptTotal": the final total after rounding
- Do NOT include service charge, SST, rounding, subtotal, or payment info in the items array
- Return ONLY the JSON, no markdown, no explanation

=== RECEIPT TEXT ===
${text}
===================`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer": "https://scan-n-pay.vercel.app/"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[parse-receipt-text] Gemini API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json({ error: "Empty response from Gemini" }, { status: 502 });
    }

    // Clean markdown fences if present
    const jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("[parse-receipt-text] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to parse receipt text" },
      { status: 500 }
    );
  }
}
