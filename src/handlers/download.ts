const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export function handleDownload(request: Request): Response {
  const url = new URL(request.url);
  const sizeParam = url.searchParams.get("size");
  const size = sizeParam ? Number(sizeParam) : NaN;

  if (!Number.isFinite(size) || size <= 0 || size > MAX_DOWNLOAD_BYTES) {
    return new Response("Invalid size", { status: 400 });
  }

  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes.subarray(0, Math.min(size, 65536)));
  // 65536바이트 이후는 반복 채움(랜덤성보다 순수 처리량 측정이 목적)
  for (let offset = 65536; offset < size; offset += 65536) {
    bytes.set(bytes.subarray(0, Math.min(65536, size - offset)), offset);
  }

  return new Response(bytes, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(size),
      "cache-control": "no-store",
    },
  });
}
