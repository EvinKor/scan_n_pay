import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/parse-receipt
 *
 * Sends the receipt image to Gemini Flash which can SEE the image
 * and extract structured item data directly — far more reliable
 * than OCR + regex for multi-column receipts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const imageBase64: string | undefined = body?.imageBase64;

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
  }

  // Try Gemini key first, fall back to Vision key (same Google API key may work for both)
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_VISION_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured for Gemini" },
      { status: 500 }
    );
  }

  const model = "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `You are a receipt parser. Analyze this receipt image and extract ALL food/drink line items with their prices and quantities.

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
- "name": the item name as shown on the receipt (include modifiers like "Soba", "Cold", "Teriyaki" in the name if present)
- "quantity": the quantity ordered (the number shown on the receipt for that item, default 1)
- "price": the TOTAL price for that line as a number (not string), in the local currency (RM for Malaysian receipts). This is qty × unit price as shown on the receipt.
- Skip items with price 0.00 or free items
- "serviceCharge": the service charge amount (if any)
- "sst": SST / government tax amount (if any)  
- "rounding": rounding adjustment amount (e.g. 0.02 or -0.02) if explicitly shown
- "receiptTotal": the final total amount on the receipt
- Do NOT include service charge, SST, or rounding in the items array
- Return ONLY the JSON, no markdown, no explanation`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: response.status }
      );
    }

    const json = await response.json();
    const rawText =
      json.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!rawText) {
      return NextResponse.json(
        { error: "Gemini returned empty response" },
        { status: 500 }
      );
    }

    // Parse the JSON response from Gemini
    // Strip markdown code fences if present
    const cleanedText = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleanedText);

    // Validate structure
    if (!parsed.items || !Array.isArray(parsed.items)) {
      return NextResponse.json(
        { error: "Invalid response structure from Gemini" },
        { status: 500 }
      );
    }

    // Clean and validate each item
    const items = parsed.items
      .filter(
        (item: any) =>
          item.name &&
          typeof item.name === "string" &&
          typeof item.price === "number" &&
          item.price > 0
      )
      .map((item: any) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity) || 1,
        price: Math.round(item.price * 100) / 100,
      }));

    return NextResponse.json({
      items,
      serviceCharge: Number(parsed.serviceCharge) || 0,
      sst: Number(parsed.sst) || 0,
      rounding: Number(parsed.rounding) || 0,
      receiptTotal: Number(parsed.receiptTotal) || 0,
    });
  } catch (err: any) {
    console.error("Gemini parse-receipt error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to parse receipt with Gemini" },
      { status: 500 }
    );
  }
}
