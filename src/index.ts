import type { Env } from "./env";
import { handleNetworkCheck } from "./handlers/networkCheck";
import { handleLocationCheck } from "./handlers/locationCheck";
import { handleDownload } from "./handlers/download";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/network-check") {
      return handleNetworkCheck(request);
    }
    if (url.pathname === "/api/location-check") {
      return handleLocationCheck(request, env);
    }
    if (url.pathname === "/api/download") {
      return handleDownload(request);
    }
    if (url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
