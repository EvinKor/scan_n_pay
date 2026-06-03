/**
 * TNG eWallet deep link
 * Opens the TNG app pre-filled with recipient + amount.
 * Falls back to TNG web if app not installed.
 */
export function buildTNGLink(phone: string, amount: number, memo = "SplitLah"): string {
  // Normalize phone: strip leading 0, add 60 country code
  const normalized = phone.replace(/\D/g, "").replace(/^0/, "60");
  const encodedMemo = encodeURIComponent(memo);
  const formattedAmount = amount.toFixed(2);

  // TNG deep link scheme
  return `tngd://payment?phoneNo=${normalized}&amount=${formattedAmount}&memo=${encodedMemo}`;
}

export function openTNGPayment(phone: string, amount: number, memo?: string) {
  const link = buildTNGLink(phone, amount, memo);
  window.location.href = link;

  // Fallback: if app doesn't open within 1.5s, show web fallback
  setTimeout(() => {
    const fallback = `https://tngdigital.com.my/`;
    window.open(fallback, "_blank");
  }, 1500);
}
