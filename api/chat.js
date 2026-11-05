
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_FALLBACK_MODEL = "gemini-3.8-flash";

const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

async function handlePost(request) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();

  if (!apiKey) {
    return json({
      error: "GEMINI_API_KEY가 Vercel 환경변수에 없습니다.",
    }, 500);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "요청 본문을 읽을 수 없습니다." }, 400);
  }

  const incoming = Array.isArray(body?.messages)
    ? body.messages
    : [];

  const contents = incoming
    .filter(
      (message) =>
        message &&
        (message.role === "user" ||
          message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .slice(-20)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content.trim().slice(0, 6000) }],
    }));

  if (!contents.length) {
    return json({ error: "질문을 입력하세요." }, 400);
  }

  try {
    const requestBody = JSON.stringify({
      systemInstruction: {
        parts: [{
          text: "너는 Lozix의 AI 공부 도우미다. 학생의 질문을 한국어로 친절하고 정확하게 설명한다. 핵심 개념과 풀이 과정을 단계적으로 설명하고, 모르는 내용은 추측하지 않는다.",
        }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: 2048,
        thinkingConfig: {
          thinkingLevel: "low",
        },
      },
    });

    const callModel = (model) =>
      fetch(GEMINI_URL(model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: requestBody,
      });

    let response = await callModel(GEMINI_MODEL);

    if (response.status === 503) {
      console.warn(
        `${GEMINI_MODEL} is busy; retrying with ${GEMINI_FALLBACK_MODEL}.`,
      );

      response = await callModel(GEMINI_FALLBACK_MODEL);
    }

    if (!response.ok) {
      const raw = await response.text();

      let payload = null;

      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        // Non-JSON error response
      }

      const message =
        payload?.error?.message ||
        raw.slice(0, 800) ||
        "Gemini 응답이 없습니다.";

      console.error("Gemini API error:", response.status, message);

      return json(
        {
          error: `Gemini API 오류 (${response.status}): ${message}`,
        },
        response.status,
      );
    }

    if (!response.body) {
      return json({
        error: "Gemini 스트리밍 응답을 받을 수 없습니다.",
      }, 502);
    }

    // Gemini SSE 스트림을 브라우저로 전달
    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });

  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error);

    console.error("Lozix /api/chat error:", error);

    return json({
      error: `AI 서버 오류: ${detail}`,
    }, 500);
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method === "GET") {
      return json({
        ok: true,
        service: "lozix-ai",
        route: "/api/chat",
        message: "Lozix streaming AI API route is deployed.",
      });
    }

    if (request.method === "POST") {
      return handlePost(request);
    }

    return json({
      error: "지원하지 않는 요청 방식입니다.",
    }, 405);
  },
};
