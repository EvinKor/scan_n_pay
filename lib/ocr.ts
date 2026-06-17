import { LineItem } from "./session";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

export interface ReceiptResult {
  items: LineItem[];
  serviceCharge: number;
  sst: number;
  rounding?: number;
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

        // Do not add service charge and SST as line items so they get split proportionally instead of evenly

        return {
          items,
          serviceCharge: data.serviceCharge || 0,
          sst: data.sst || 0,
          rounding: data.rounding || 0,
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

      // Compress the image before returning base64 to avoid busting API size limits
      const img = new Image();
                      img.onload = () => {
                        const canvas = document.createElement("canvas");
                        const MAX_DIMENSION = 1600; // Good balance for OCR accuracy and size
                        let width = img.width;
                        let height = img.height;

                        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                          if (width > height) {
                            height = Math.round((height * MAX_DIMENSION) / width);
                            width = MAX_DIMENSION;
                          } else {
                            width = Math.round((width * MAX_DIMENSION) / height);
                            height = MAX_DIMENSION;
                          }
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                          ctx.drawImage(img, 0, 0, width, height);
                          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
                          const base64 = compressedDataUrl.split(",")[1] || "";
                          resolve(base64);
                        } else {
                          // Fallback if canvas context fails
                          const base64 = dataUrl.split(",")[1] || "";
                          resolve(base64);
                        }
                      };
                      img.onerror = () => reject(new Error("Failed to read image file"));
                      img.src = dataUrl;
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
  let rounding = 0;
  let receiptTotal = 0;
  let lastUnpricedLine = "";

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
    /(?:\bchange\b|\bcash\b|\bvisa\b|\bmaster(?:card)?\b|\bdebit\b|\bcredit\b|\bpayment\b|\btender\b|\bpaid\b|\bbalance\b|card\s*no|card\s*type|approved|amount\s*[:\[])/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip decorative lines
    if (skipLinePattern.test(line)) continue;

    // Extract RM price from the line
    const price = extractRMPrice(line);

    // If no RM price found, check if it's a modifier line (e.g. ":Soba", ":Cold") or save as item name
    if (price === null) {
      if (/^[:;]/.test(line)) {
        // Modifier lines — append to previous item name
        const modifier = line.replace(/^[:;]\s*/, "").trim();
        if (modifier) {
          if (lastUnpricedLine) {
            lastUnpricedLine += ` (${modifier})`;
          } else if (items.length > 0) {
            items[items.length - 1].name += ` (${modifier})`;
          }
        }
      } else if (!metadataPattern.test(line) && /[a-zA-Z]/.test(line)) {
        // Save as a potential item name if it has letters and is not metadata
        lastUnpricedLine = line;
      }
      continue;
    }

    // Skip RM0.00 items (freebies / zero-price)
    if (price <= 0) continue;

    // Now classify the line
    const cleanedLine = line.replace(/\s+/g, " ").trim();

    // Extract the item name and quantity from the line
    let { name: itemName, quantity } = extractItemNameAndQty(cleanedLine);

    // If we only found a price and quantity (e.g. "1 RM16.90") but no name, 
    // it was likely split across lines by the OCR.
    if (!itemName || !/[a-zA-Z]/.test(itemName)) {
      if (lastUnpricedLine) {
        itemName = lastUnpricedLine;
        lastUnpricedLine = ""; // Consume it

        // If the unpriced line had a leading quantity (e.g. "2 N21 Salmon..."), use it
        const qtyMatch = itemName.match(/^(\d{1,2})\s+/);
        if (qtyMatch && quantity === 1) {
          quantity = parseInt(qtyMatch[1], 10);
          itemName = itemName.replace(/^\d{1,2}\s+/, "");
        }
      } else {
        // Look ahead to the NEXT line if we didn't have one buffered
        for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j++) {
          const nextLine = lines[j].trim();
          if (extractRMPrice(nextLine) === null && !metadataPattern.test(nextLine) && /[a-zA-Z]/.test(nextLine)) {
            itemName = nextLine;
            const qtyMatch = itemName.match(/^(\d{1,2})\s+/);
            if (qtyMatch && quantity === 1) {
              quantity = parseInt(qtyMatch[1], 10);
              itemName = itemName.replace(/^\d{1,2}\s+/, "");
            }
            lines[j] = ""; // Clear it so we don't process it again
            break;
          }
        }
      }
    } else {
      lastUnpricedLine = ""; // We successfully parsed a full line, clear buffer
    }

    // Now classify the resolved item name + line
    const textToClassify = (itemName + " " + cleanedLine).toLowerCase();

    // Check for service charge
    if (serviceChargePattern.test(textToClassify)) {
      serviceCharge = price;
      continue;
    }

    // Check for SST / gov service tax
    if (taxPattern.test(textToClassify)) {
      sst = price;
      continue;
    }

    // Check for total (but not subtotal) — check before rounding since
    // "Total after Rounding" contains both keywords
    if (totalPattern.test(textToClassify) && !subtotalPattern.test(textToClassify)) {
      receiptTotal = price;
      continue;
    }

    // Check for rounding adjustment
    if (roundingPattern.test(textToClassify)) {
      rounding = /-\s*RM/i.test(line) ? -price : price;
      continue;
    }

    // Check for subtotal — skip
    if (subtotalPattern.test(textToClassify)) {
      continue;
    }

    // Skip metadata lines that happen to have a price
    if (metadataPattern.test(textToClassify)) {
      continue;
    }

    // Skip payment lines
    if (paymentLinePattern.test(textToClassify)) {
      continue;
    }

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

  // Do not add service charge and SST as claimable line items so they are split proportionally instead

  const itemsTotal = items.reduce((s, it) => s + (it.price || 0), 0);
  const computedTotal = +itemsTotal.toFixed(2);
  const discrepancy = receiptTotal ? +(receiptTotal - computedTotal).toFixed(2) : 0;
  const totalMatches = receiptTotal ? Math.abs(discrepancy) < 0.10 : true;

  return { items, serviceCharge, sst, rounding, receiptTotal, computedTotal, discrepancy, totalMatches };
}

/**
 * Extract a price from a line that contains "RM" prefix.
 * Returns the LAST RM-prefixed number on the line (the actual price, not qty).
 * Handles formats: RM16.90, RM 16.90, RM5.00, RM 5.00
 * Also handles OCR misreadings: RMO.00 (O instead of 0), RM1S.90 (S instead of 5)
 */
function extractRMPrice(line: string): number | null {
  // Match RM followed by optional space, then digits/OCR-letters with optional decimal or comma
  const rmPattern = /RM\s*([0-9Oo]{1,6}(?:[.,][0-9Oo]{1,2})?)/gi;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null = null;
  while ((match = rmPattern.exec(line)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;

  // Fix common OCR misreadings in the price digits
  const cleaned = lastMatch[1]
    .replace(/[Oo]/g, "0")
    .replace(/,/g, ".");

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
