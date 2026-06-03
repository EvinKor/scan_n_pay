import { LineItem } from "./session";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

export interface ReceiptResult {
  items: LineItem[];
  serviceCharge: number;
  sst: number;
  receiptTotal: number;
  computedTotal?: number;
  discrepancy?: number;
  totalMatches?: boolean;
}

/**
 * Extract receipt items from an image.
 *
 * Strategy (in order):
 * 1. Gemini Flash — sends the image directly, gets structured JSON back (most reliable)
 * 2. Google Vision OCR + text parsing (fallback)
 * 3. Client-side Tesseract OCR + text parsing (last resort)
 */
export async function extractReceiptItems(
  imageSource: File | string,
  onProgress?: (pct: number) => void
): Promise<ReceiptResult> {
  if (onProgress) onProgress(5);

  const base64 = await toBase64(imageSource);
  if (onProgress) onProgress(15);

  // ── Attempt 1: Gemini Flash (structured parsing) ──
  try {
    if (onProgress) onProgress(20);
    console.log("[OCR] Trying Gemini Flash for structured receipt parsing...");

    const geminiRes = await fetch("/api/parse-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
    });

    if (geminiRes.ok) {
      const data = await geminiRes.json();

      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        console.log(`[OCR] Gemini extracted ${data.items.length} items successfully`);
        if (onProgress) onProgress(100);

        // Convert to LineItem format (add id and assignedTo)
        const items: LineItem[] = data.items.map((item: { name: string; price: number; quantity?: number }) => ({
          id: nanoid(),
          name: item.name,
          quantity: item.quantity || 1,
          price: Math.round(item.price * 100) / 100,
          assignedTo: [],
        }));

        // Add service charge and SST as line items so they get split
        if (data.serviceCharge > 0) {
          items.push({
            id: nanoid(),
            name: "Service Charge",
            quantity: 1,
            price: Math.round(data.serviceCharge * 100) / 100,
            assignedTo: [],
          });
        }
        if (data.sst > 0) {
          items.push({
            id: nanoid(),
            name: "SST",
            quantity: 1,
            price: Math.round(data.sst * 100) / 100,
            assignedTo: [],
          });
        }

        return {
          items,
          serviceCharge: data.serviceCharge || 0,
          sst: data.sst || 0,
          receiptTotal: data.receiptTotal || 0,
        };
      } else {
        console.warn("[OCR] Gemini returned 0 items, falling back to Vision OCR...");
      }
    } else {
      console.warn(`[OCR] Gemini API returned ${geminiRes.status}, falling back to Vision OCR...`);
    }
  } catch (err) {
    console.warn("[OCR] Gemini request failed, falling back to Vision OCR:", err);
  }

  // ── Attempt 2: Google Vision OCR + text parsing ──
  let text = "";
  try {
    if (onProgress) onProgress(40);
    console.log("[OCR] Trying Google Vision OCR...");

    const response = await fetch("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
    });

    if (response.ok) {
      const data = await response.json();
      text = data.text || "";
      if (onProgress) onProgress(80);
    } else {
      console.warn("[OCR] Vision API failed, falling back to Tesseract...");
    }
  } catch (err) {
    console.error("[OCR] Vision API error, falling back to Tesseract:", err);
  }

  // ── Attempt 3: Tesseract (client-side) ──
  if (!text) {
    if (onProgress) onProgress(50);
    console.log("[OCR] Trying Tesseract (client-side)...");
    text = await extractWithTesseract(base64, (pct) => {
      if (onProgress) {
        onProgress(Math.round(50 + pct * 0.4));
      }
    });
  }

  if (!text || text.trim().length === 0) {
    throw new Error("No text found in image. Try a clearer photo.");
  }

  console.log("=== RAW OCR TEXT ===\n" + text + "\n====================");

  if (onProgress) onProgress(95);
  const result = parseReceiptText(text);
  if (onProgress) onProgress(100);
  return result;
}

/**
 * Convert File or URL to base64 string (without the data:... prefix).
 */
async function toBase64(source: File | string): Promise<string> {
  if (typeof source === "string") {
    // URL — fetch and convert
    const res = await fetch(source);
    const blob = await res.blob();
    return blobToBase64(blob);
  }
  return blobToBase64(source);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:image/...;base64," prefix
      const base64 = dataUrl.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Enhances image contrast and converts it to grayscale to improve Tesseract OCR accuracy.
 */
function preprocessImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Apply contrast boost (approx 80) and convert to grayscale
        const contrast = 80;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Grayscale conversion (Luminosity formula)
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;

          // Contrast adjustments
          let newColor = factor * (gray - 128) + 128;
          if (newColor < 0) newColor = 0;
          if (newColor > 255) newColor = 255;

          data[i] = newColor;
          data[i + 1] = newColor;
          data[i + 2] = newColor;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        console.error("Canvas preprocessing error:", e);
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

/**
 * Client-side Tesseract OCR fallback.
 * Dynamically imports `tesseract.js` so the package is optional.
 * Install with: `npm install tesseract.js`.
 */
async function extractWithTesseract(base64: string, onProgress?: (pct: number) => void): Promise<string> {
  // Only run in browser
  if (typeof window === "undefined") {
    throw new Error("Tesseract fallback requires a browser environment.");
  }

  const rawDataUrl = `data:image/png;base64,${base64}`;
  const dataUrl = await preprocessImage(rawDataUrl);

  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", undefined, {
      logger: (m) => {
        if (m.status === "recognizing" && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      }
    });

    await worker.setParameters({
      preserve_interword_spaces: "1"
    });

    const { data } = await worker.recognize(dataUrl);
    await worker.terminate();
    return data?.text || "";
  } catch (err) {
    console.error("Tesseract OCR failed:", err);
    throw new Error("Local OCR failed. Ensure the image is clear or try again.");
  }
}

// ─── Receipt Text Parser ────────────────────────────────────────────────────

/**
 * Parse raw OCR text into structured receipt data.
 * Designed for Malaysian receipts with RM currency prefix.
 *
 * Strategy:
 * 1. Find lines containing "RM" followed by a number — these are priced lines.
 * 2. Classify each priced line as: item, service charge, SST/tax, total, subtotal, etc.
 * 3. Lines without prices that start with ":" are modifiers — append to previous item name.
 */
function parseReceiptText(text: string): ReceiptResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: LineItem[] = [];
  let serviceCharge = 0;
  let sst = 0;
  let receiptTotal = 0;

  // Patterns for special lines
  const serviceChargePattern =
    /service\s*charge/i;
  const taxPattern =
    /(?:\bsst\b|(?:gov(?:ernment)?\.?\s*)?service\s*tax|sales\s*(?:&|and)\s*service\s*tax|\bgst\b|\bgov(?:t|ernment)?\s*tax\b)/i;
  const totalPattern =
    /(?:total\s*(?:after\s*rounding)?|grand\s*total|nett?\s*total|amount\s*due|total\s*(?:amount|due|payable))/i;
  const subtotalPattern =
    /(?:sub\s*-?\s*total|subtotal)/i;
  const roundingPattern =
    /(?:rounding|adj(?:ustment)?)/i;

  // Lines to completely skip (metadata, not financial)
  const skipLinePattern =
    /^(?:={2,}|-{2,}|\*{2,}|_{2,})$|^\*+$|^-+$/;
  const metadataPattern =
    /(?:receipt|thank\s*you|welcome|table\s*[:.]|bill\s*no|invoice|pax\s*[:.]|tel\s*[:.]|phone|address|date\s*[:.]|time\s*[:.]|cashier|server\s*[:.]|order\s*(?:no|id)|dine.?in|take.?away|member|card\s*(?:no|type)|ref\s*no|trx\s*no|terminal|merchant|approved|sst\s*id|debit|credit\s*card)/i;
  const paymentLinePattern =
    /^(?:change|cash|visa|master(?:card)?|debit|credit|payment|tender|paid|balance|card\s*no|card\s*type|approved\s*amount)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip decorative lines
    if (skipLinePattern.test(line)) continue;

    // Extract RM price from the line
    const price = extractRMPrice(line);

    // If no RM price found, check if it's a modifier line (e.g. ":Soba", ":Cold")
    if (price === null) {
      // Modifier lines — append to previous item name
      if (/^[:;]/.test(line) && items.length > 0) {
        const modifier = line.replace(/^[:;]\s*/, "").trim();
        if (modifier) {
          items[items.length - 1].name += ` (${modifier})`;
        }
      }
      continue;
    }

    // Skip RM0.00 items (freebies / zero-price)
    if (price <= 0) continue;

    // Now classify the line
    const cleanedLine = line.replace(/\s+/g, " ").trim();

    // Check for service charge
    if (serviceChargePattern.test(cleanedLine)) {
      serviceCharge = price;
      continue;
    }

    // Check for SST / gov service tax
    if (taxPattern.test(cleanedLine)) {
      sst = price;
      continue;
    }

    // Check for total (but not subtotal) — check before rounding since
    // "Total after Rounding" contains both keywords
    if (totalPattern.test(cleanedLine) && !subtotalPattern.test(cleanedLine)) {
      receiptTotal = price;
      continue;
    }

    // Check for rounding adjustment — skip
    if (roundingPattern.test(cleanedLine)) {
      continue;
    }

    // Check for subtotal — skip
    if (subtotalPattern.test(cleanedLine)) {
      continue;
    }

    // Skip metadata lines that happen to have a price
    if (metadataPattern.test(cleanedLine)) {
      continue;
    }

    // Skip payment lines
    if (paymentLinePattern.test(cleanedLine)) {
      continue;
    }

    // Extract the item name and quantity from the line
    const { name: itemName, quantity } = extractItemNameAndQty(cleanedLine);
    if (!itemName || itemName.length < 2) continue;

    // Must contain at least one alphabetic character
    if (!/[a-zA-Z]/.test(itemName)) continue;

    items.push({
      id: nanoid(),
      name: itemName,
      quantity,
      price: price,
      assignedTo: [],
    });
  }

  // If we found service charge, add it as a line item so it shows up in the split
  if (serviceCharge > 0) {
    items.push({
      id: nanoid(),
      name: "Service Charge",
      quantity: 1,
      price: serviceCharge,
      assignedTo: [],
    });
  }

  // If we found SST, add it as a line item too
  if (sst > 0) {
    items.push({
      id: nanoid(),
      name: "SST",
      quantity: 1,
      price: sst,
      assignedTo: [],
    });
  }

  const itemsTotal = items.reduce((s, it) => s + (it.price || 0), 0);
  const computedTotal = +itemsTotal.toFixed(2);
  const discrepancy = receiptTotal ? +(receiptTotal - computedTotal).toFixed(2) : 0;
  const totalMatches = receiptTotal ? Math.abs(discrepancy) < 0.10 : true;

  return { items, serviceCharge, sst, receiptTotal, computedTotal, discrepancy, totalMatches };
}

/**
 * Extract a price from a line that contains "RM" prefix.
 * Returns the LAST RM-prefixed number on the line (the actual price, not qty).
 * Handles formats: RM16.90, RM 16.90, RM5.00, RM 5.00
 * Also handles OCR misreadings: RMO.00 (O instead of 0), RM1S.90 (S instead of 5)
 */
function extractRMPrice(line: string): number | null {
  // Match RM followed by optional space, then digits/OCR-letters with optional decimal
  const rmPattern = /RM\s*([0-9Oo]{1,6}(?:\.[0-9Oo]{1,2})?)/gi;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null = null;
  while ((match = rmPattern.exec(line)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;

  // Fix common OCR misreadings in the price digits
  const cleaned = lastMatch[1]
    .replace(/[Oo]/g, "0");

  const val = parseFloat(cleaned);
  if (isNaN(val)) return null;
  return val;
}

/**
 * Extract the item name AND quantity from a receipt line.
 *
 * A typical Malaysian receipt line looks like:
 *   "U7 Tenzaru        1   RM16.90"
 *   "N21 Salmon S. Aburi Yaki   2   RM5.00"
 *   "G1 Chicken Teriyaki Pasta  1   RM16.90"
 *
 * We strip:
 *  1. The RM price portion (and everything after it)
 *  2. Trailing quantity number(s) before the price (captured as quantity)
 */
function extractItemNameAndQty(line: string): { name: string; quantity: number } {
  // Remove from the qty+RM price onward (e.g. "1 RM16.90")
  let name = line.replace(/\s*\d*\s*RM\s*[0-9Oo]+(?:\.[0-9Oo]{1,2})?\s*$/i, "").trim();

  // If that didn't work (RM might be in the middle), try removing last RM occurrence
  if (name === line.trim()) {
    name = line.replace(/\s*RM\s*[0-9Oo]+(?:\.[0-9Oo]{1,2})?/gi, "").trim();
  }

  // Extract and remove trailing standalone number (quantity like "1", "2", "3")
  let quantity = 1;
  const qtyMatch = name.match(/\s+(\d{1,2})\s*$/);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10) || 1;
    name = name.replace(/\s+\d{1,2}\s*$/, "").trim();
  }

  // Clean up extra whitespace
  name = name.replace(/\s{2,}/g, " ").trim();

  return { name, quantity };
}
