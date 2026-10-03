declare const process: { env: Record<string, string | undefined> };

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODELS = ["gpt-6-astra", "gpt-6-luna", "gpt-6.1-sol"];

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function send(res: any, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

function extractText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const texts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        texts.push(content.text);
      }
    }
  }
  return texts.join("\n").trim();
}

function getRequestBody(req: any): any {
  if (req?.body && typeof req.body === "object") return req.body;
  if (typeof req?.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") return send(res, 405, { error: "POST 요청만 허용됩니다." });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return send(res, 500, {
      error: "OPENAI_API_KEY가 Vercel 실행 환경에 없습니다. Vercel 환경변수를 확인한 뒤 새 배포를 해주세요.",
    });
  }

  const body = getRequestBody(req);
  const messages = body?.messages as ChatMessage[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0) {
    return send(res, 400, { error: "질문을 입력하세요." });
  }

  const safeMessages = messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 6000),
    }));

  if (!safeMessages.length) return send(res, 400, { error: "유효한 질문이 없습니다." });

  let lastStatus = 500;
  let lastMessage = "OpenAI API 호출에 실패했습니다.";

  for (const model of MODELS) {
    try {
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          instructions: "너는 Lozix의 AI 공부 도우미다. 학생의 질문을 한국어로 친절하고 정확하게 설명한다. 핵심 개념과 풀이 과정을 단계적으로 설명하고, 모르는 내용은 추측하지 않는다.",
          input: safeMessages,
          store: false,
        }),
      });

      const raw = await response.text();
      let payload: any = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }

      if (response.ok) {
        const answer = extractText(payload);
        if (!answer) {
          return send(res, 502, { error: `OpenAI(${model})에서 답변을 받았지만 읽을 수 있는 텍스트가 없습니다.` });
        }
        return send(res, 200, { answer });
      }

      lastStatus = response.status;
      const apiMessage = payload?.error?.message;
      lastMessage = apiMessage || raw.slice(0, 800) || `HTTP ${response.status}`;

      // A model-not-found/availability 404 can differ by API project. Try the next official model.
      if (response.status !== 404) break;
    } catch (error) {
      lastStatus = 500;
      lastMessage = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  return send(res, lastStatus, {
    error: `OpenAI API 오류 (${lastStatus}): ${lastMessage}`,
  });
}
