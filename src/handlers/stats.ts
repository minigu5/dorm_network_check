import type { Env } from "../env";
import { fetchStatsRows } from "../lib/db";
import { computeDormStats } from "../lib/dormStats";

// 학생용 /stats 페이지가 쓰는 공개 집계. 방별 단계·통신사별 단계 개수만 내려가고
// 원본 속도 값, 좌표, IP 해시는 나가지 않는다.
export async function handleStats(env: Env): Promise<Response> {
  const stats = computeDormStats(await fetchStatsRows(env.DB));
  return new Response(JSON.stringify(stats), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
    },
  });
}
