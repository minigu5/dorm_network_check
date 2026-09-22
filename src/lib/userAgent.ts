export function parseOS(userAgent: string | null): "iOS" | "Android" | "Other" {
  if (!userAgent) return "Other";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  return "Other";
}
