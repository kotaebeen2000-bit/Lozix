

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_FALLBACK_MODEL = "gemini-3.8-flash";

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

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

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) return "";

  return parts
    .filter((part) => typeof part?.text === "string")
    .map((part) => part.text)
    .join("");
}

function createRequestBody(contents) {
  return {
    systemInstruction: {
      parts: [
        {
          text: [
            "너는 Lozix의 AI 공부 도우미다.",
            "학생의 질문에 한국어로 친절하고 정확하게 답변한다.",
            "어려운 개념은 쉬운 말로 풀어서 설명한다.",
            "필요하면 단계별 풀이와 구체적인 예시를 제공한다.",
            "답변은 제목, 설명, 예시, 핵심 요약을 적절히 구분한다.",
            "모르는 내용은 추측하지 말고 불확실하다고 밝힌다.",
          ].join("\n"),
        },
      ],
    },
    contents,
    generationConfig: {
      maxOutputTokens: 2048,
      thinkingConfig: {
        thinkingLevel: "low",
      },
    },
  };
}

function makeContents(messages) {
  return messages
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
      parts: [
        {
          text: message.content.trim().slice(0, 6000),
        },
      ],
    }));
}

async function callGemini(model, apiKey, requestBody, stream) {
  const method = stream
    ? "streamGenerateContent?alt=sse"
    : "generateContent";

  return fetch(`${GEMINI_BASE_URL}/${model}:${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });
}

async function getErrorMessage(response) {
  const raw = await response.text();

  try {
    const payload = raw ? JSON.parse(raw) : null;
    return (
      payload?.error?.message ||
      raw.slice(0, 800) ||
      "Gemini 응답이 없습니다."
    );
  } catch {
    return raw.slice(0, 800) || "Gemini 응답이 없습니다.";
  }
}

async function handlePost(request) {
  const apiKey = String(
    process.env.GEMINI_API_KEY || "",
  ).trim();

  if (!apiKey) {
    return json({
      error: "GEMINI_API_KEY가 Vercel 환경변수에 없습니다.",
    }, 500);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      error: "요청 본문을 읽을 수 없습니다.",
    }, 400);
  }

  const contents = makeContents(
    Array.isArray(body?.messages) ? body.messages : [],
  );

  if (!contents.length) {
    return json({
      error: "질문을 입력하세요.",
    }, 400);
  }

  // 기본값은 기존 프론트엔드와 호환되는 JSON 방식
  // 프론트엔드가 stream: true를 보내면 SSE 방식 사용
  const stream = body?.stream === true;

  try {
    const requestBody = createRequestBody(contents);

    let response = await callGemini(
      GEMINI_MODEL,
      apiKey,
      requestBody,
      stream,
    );

    if (response.status === 503) {
      console.warn(
        `${GEMINI_MODEL} is busy. Retrying with ${GEMINI_FALLBACK_MODEL}.`,
      );

      response = await callGemini(
        GEMINI_FALLBACK_MODEL,
        apiKey,
        requestBody,
        stream,
      );
    }

    if (!response.ok) {
      const message = await getErrorMessage(response);

      console.error(
        "Gemini API error:",
        response.status,
        message,
      );

      return json({
        error: `Gemini API 오류 (${response.status}): ${message}`,
      }, response.status);
    }

    // 스트리밍 모드
    if (stream) {
      if (!response.body) {
        return json({
          error: "Gemini 스트리밍 응답이 없습니다.",
        }, 502);
      }

      return new Response(response.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // 기존 JSON 모드
    const payload = await response.json();
    const answer = extractText(payload);

    if (!answer) {
      console.error(
        "Gemini returned no readable text:",
        JSON.stringify(payload).slice(0, 1000),
      );

      return json({
        error: "Gemini에서 읽을 수 있는 답변을 받지 못했습니다.",
      }, 502);
    }

    return json({
      answer,
    });

  } catch (error) {
    console.error("Lozix AI server error:", error);

    const detail =
      error instanceof Error
        ? error.message
        : String(error);

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
        version: "2.0",
        features: [
          "json",
          "streaming",
          "conversation-history",
          "fallback-model",
        ],
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

