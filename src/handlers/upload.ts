export async function handleUpload(request: Request): Promise<Response> {
  const buf = await request.arrayBuffer();
  return new Response(JSON.stringify({ received: buf.byteLength }), {
    headers: { "content-type": "application/json" },
  });
}
