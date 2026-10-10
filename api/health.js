function healthResponse() {
  return Response.json({
    ok: true,
    service: "lozix-api",
    route: "/api/health",
  });
}

export default {
  fetch(request) {
    if (request.method === "GET") {
      return healthResponse();
    }

    return Response.json(
      { error: "지원하지 않는 요청 방식입니다." },
      { status: 405, headers: { Allow: "GET, HEAD" } },
    );
  },
};
