# 🧾 SplitLah — Receipt Split PWA

Scan receipts, split bills, pay via Touch 'n Go. No login required.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| OCR | Tesseract.js (free, runs in browser) |
| Backend / Realtime | Supabase |
| Hosting | Vercel |
| Payments | TNG Deep Link |
| State | Zustand + localStorage |

---

## Setup

### 1. Clone & install

```bash
git clone <your-repo>
cd receipt-split
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run the contents of `supabase-schema.sql`
3. Go to **Database → Replication** and enable realtime for the `sessions` table
4. Copy your project URL and anon key from **Settings → API**

### 3. Configure environment

```bash
cp .env.local.example .env.local
# Fill in your Supabase URL and anon key
```

### 4. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`

### 5. Deploy to Vercel

```bash
npm i -g vercel
vercel
# Add env vars in Vercel dashboard or via CLI
```

---

## How It Works

### Flow

```
Creator → Scan receipt → OCR extracts items → Share room code
Others  → Enter code + name → Join room
Everyone → Choose split mode (even / by item)
Everyone → Lock split → Pay via TNG
Payer    → Sees real-time payment status
```

### No-Login Identity

- Each user enters a name on first visit
- Name is stored in `localStorage` under `splitlah_user`
- Name is used as their identity throughout the session
- No passwords, no OAuth

### TNG Payment

The pay button opens:
```
tngd://payment?phoneNo=601XXXXXXXX&amount=XX.XX&memo=SplitLah+MAKAN-7X2
```

This deep link opens the TNG app pre-filled with the payer's number and the owed amount.

---

## Project Structure

```
app/
  page.tsx              # Home — create or join session
  scan/page.tsx         # Scan receipt + set who paid
  room/[id]/page.tsx    # Split + Pay room
lib/
  supabase.ts           # Supabase client
  session.ts            # Session CRUD + calculations
  ocr.ts                # Tesseract.js receipt parsing
  identity.ts           # localStorage user identity
  tng.ts                # TNG deep link builder
```

---

## Improving OCR Accuracy

Tesseract.js works best with:
- Clear, well-lit photos
- Flat receipts (no folds)
- High contrast (thermal paper on white background)

If accuracy is poor, consider:
1. Preprocessing the image (contrast boost) before OCR
2. Swapping in Google Cloud Vision (free 1000/month)
3. Using Claude Vision API (~RM0.05/scan)

---

## Supabase Realtime

The room page subscribes to live updates via Supabase Realtime:
- When anyone changes split mode, adds items, or marks payment — all screens update instantly
- No polling required

---

## Future Improvements

- [ ] QR code for joining (instead of typing code)
- [ ] DuitNow as second payment option
- [ ] Service charge / SST auto-detection in OCR
- [ ] Session expiry (auto-delete after 24h)
- [ ] WhatsApp reminder to unpaid members
- [ ] Export summary as image
