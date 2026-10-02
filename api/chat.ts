declare const process: { env: Record<string, string | undefined> };

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-6-luna";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function extractText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const texts: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        texts.push(content.text);
      }
    }
  }
  return texts.join("\n").trim();
}

function send(res: any, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "POST 요청만 허용됩니다." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return send(res, 500, {
      error: "OPENAI_API_KEY가 Vercel 실행 환경에 없습니다. Vercel 환경변수에 추가한 뒤 반드시 새 배포를 해주세요.",
    });
  }

  const messages = req.body?.messages as ChatMessage[] | undefined;
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

  if (!safeMessages.length) {
    return send(res, 400, { error: "유효한 질문이 없습니다." });
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        instructions:
          "너는 Lozix의 AI 공부 도우미다. 학생의 질문을 한국어로 친절하고 정확하게 설명한다. 답만 던지기보다 이해할 수 있도록 핵심 개념과 풀이 과정을 단계적으로 설명한다. 모르는 내용은 추측하지 말고 불확실하다고 말한다.",
        input: safeMessages,
      }),
    });

    const raw = await response.text();
    let payload: any = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const apiMessage = payload?.error?.message;
      return send(res, response.status, {
        error: apiMessage
          ? `OpenAI API 오류 (${response.status}): ${apiMessage}`
          : `OpenAI API 오류 (${response.status})가 발생했습니다.`,
      });
    }

    const answer = extractText(payload);
    if (!answer) {
      return send(res, 502, {
        error: "OpenAI에서 답변을 받았지만 읽을 수 있는 텍스트가 없습니다.",
      });
    }

    return send(res, 200, { answer });
  } catch (error) {
    console.error("Lozix /api/chat error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return send(res, 500, {
      error: `AI 서버 오류: ${detail}`,
    });
  }
}
