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

  // Using an anchor tag click is more robust for deep links inside PWAs on iOS/Android
  const a = document.createElement("a");
  a.href = link;
  a.target = "_top";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Fallback: if app doesn't open within 1.5s, show web fallback
  setTimeout(() => {
    // We only want to trigger the fallback if the app didn't pull us out of the browser
    if (document.visibilityState === "visible") {
      const fallback = `https://tngdigital.com.my/`;
      window.open(fallback, "_blank");
    }
  }, 1500);
}
