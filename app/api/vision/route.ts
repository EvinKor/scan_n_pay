import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/vision
 *
 * Uses Google Cloud Vision (DOCUMENT_TEXT_DETECTION) to OCR a receipt image.
 * Reconstructs proper visual lines using the fullTextAnnotation structure
 * (blocks → paragraphs → words → symbols with line break markers),
 * then merges lines from different blocks that share the same Y position.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const imageBase64 = body?.imageBase64;

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_CLOUD_VISION_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Cloud Vision API key is not configured" },
      { status: 500 }
    );
  }

  const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  const response = await fetch(visionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [
            {
              // DOCUMENT_TEXT_DETECTION preserves document structure better than TEXT_DETECTION
              type: "DOCUMENT_TEXT_DETECTION",
              maxResults: 1,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: errorText || "Google Vision request failed" },
      { status: response.status }
    );
  }

  const json = await response.json();
  const fullTextAnnotation = json.responses?.[0]?.fullTextAnnotation;

  if (!fullTextAnnotation) {
    return NextResponse.json({ text: "" });
  }

  // Try structured reconstruction first (uses line break markers from Vision)
  const structuredText = reconstructFromStructure(fullTextAnnotation);
  if (structuredText) {
    console.log("[Vision] Reconstructed text using page structure");
    return NextResponse.json({ text: structuredText });
  }

  // Fallback: return raw text
  const rawText = fullTextAnnotation.text || "";
  return NextResponse.json({ text: rawText });
}

// ─── Structured Line Reconstruction ─────────────────────────────────────────

interface TextLine {
  text: string;
  midY: number;
  leftX: number;
}

/**
 * Reconstruct receipt lines using Vision API's fullTextAnnotation page structure.
 *
 * The page structure has: pages → blocks → paragraphs → words → symbols.
 * Each symbol can have a `detectedBreak` which tells us about line breaks.
 *
 * Strategy:
 * 1. Walk the structure, build lines using break markers (LINE_BREAK, EOL_SURE_SPACE)
 * 2. Each line gets the Y position from its words' bounding boxes
 * 3. Group lines from different blocks that share the same Y position (same receipt row)
 * 4. Sort each group by X position (left to right) → proper "Item Name  Qty  RM Price"
 */
function reconstructFromStructure(fullTextAnnotation: any): string {
  const pages = fullTextAnnotation?.pages;
  if (!pages?.[0]) return "";

  const allLines: TextLine[] = [];

  for (const block of pages[0].blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      let currentLineText = "";
      let lineLeftX = Infinity;
      let lineMinY = Infinity;
      let lineMaxY = -Infinity;

      for (const word of paragraph.words || []) {
        // Get word bounding box
        const vertices = word.boundingBox?.vertices || [];
        if (vertices.length < 4) continue;

        const wordLeftX = Math.min(
          vertices[0]?.x ?? 0,
          vertices[3]?.x ?? 0
        );
        const wordTopY = Math.min(
          vertices[0]?.y ?? 0,
          vertices[1]?.y ?? 0
        );
        const wordBottomY = Math.max(
          vertices[2]?.y ?? 0,
          vertices[3]?.y ?? 0
        );

        lineLeftX = Math.min(lineLeftX, wordLeftX);
        lineMinY = Math.min(lineMinY, wordTopY);
        lineMaxY = Math.max(lineMaxY, wordBottomY);

        // Build word text from symbols
        let wordText = "";
        let hasLineBreak = false;

        for (const symbol of word.symbols || []) {
          wordText += symbol.text || "";

          // Check for break type after this symbol
          const breakType = symbol.property?.detectedBreak?.type;
          if (
            breakType === "LINE_BREAK" ||
            breakType === "EOL_SURE_SPACE"
          ) {
            hasLineBreak = true;
          }
        }

        // Add word to current line
        if (currentLineText) currentLineText += " ";
        currentLineText += wordText;

        // If we hit a line break, flush the current line
        if (hasLineBreak && currentLineText.trim()) {
          allLines.push({
            text: currentLineText.trim(),
            midY: (lineMinY + lineMaxY) / 2,
            leftX: lineLeftX,
          });
          currentLineText = "";
          lineLeftX = Infinity;
          lineMinY = Infinity;
          lineMaxY = -Infinity;
        }
      }

      // Flush remaining text in the paragraph
      if (currentLineText.trim()) {
        allLines.push({
          text: currentLineText.trim(),
          midY: (lineMinY + lineMaxY) / 2,
          leftX: lineLeftX,
        });
      }
    }
  }

  if (allLines.length === 0) return "";

  // Now merge lines from different blocks that are on the same receipt row.
  // Sort by Y, then group lines with similar Y values.
  allLines.sort((a, b) => a.midY - b.midY);

  // Calculate adaptive tolerance from the actual line spacing.
  // We want to merge items and prices on the same row, but not adjacent rows.
  // Use the gaps between consecutive lines to find the natural line spacing.
  const yGaps: number[] = [];
  for (let i = 1; i < allLines.length; i++) {
    const gap = allLines[i].midY - allLines[i - 1].midY;
    if (gap > 2) yGaps.push(gap); // ignore near-zero gaps (same line fragments)
  }

  // The tolerance should be LESS than the typical line spacing.
  // Use 35% of the median gap between lines.
  let tolerance = 15; // fallback
  if (yGaps.length > 2) {
    const sortedGaps = [...yGaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
    tolerance = medianGap * 0.35;
  }

  // Group lines by Y position
  const mergedRows: TextLine[][] = [];
  let currentRow: TextLine[] = [allLines[0]];
  let currentRowY = allLines[0].midY;

  for (let i = 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (Math.abs(line.midY - currentRowY) <= tolerance) {
      currentRow.push(line);
      // Update average Y
      currentRowY =
        currentRow.reduce((sum, l) => sum + l.midY, 0) / currentRow.length;
    } else {
      mergedRows.push(currentRow);
      currentRow = [line];
      currentRowY = line.midY;
    }
  }
  mergedRows.push(currentRow);

  // Sort each row by X position (left to right) and join into text
  const textLines = mergedRows.map((row) => {
    row.sort((a, b) => a.leftX - b.leftX);
    return row.map((l) => l.text).join(" ");
  });

  return textLines.join("\n");
}
