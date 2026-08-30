const projectUrl = "https://hjvjrxgnadzwmlydvnep.supabase.co";
const publishableKey = "sb_publishable_-3gIhcg1U1sg-NVk37hwKQ_MmZtRnYz";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

export const supabase = {
  async rpc<T = unknown>(functionName: string, body: Record<string, unknown>): Promise<RpcResult<T>> {
    try {
      const response = await fetch(`${projectUrl}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return { data: null, error: { message: payload?.message ?? "서버 요청에 실패했습니다." } };
      return { data: payload as T, error: null };
    } catch {
      return { data: null, error: { message: "서버에 연결할 수 없습니다." } };
    }
  },
};
