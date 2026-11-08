const SUPABASE_URL = "https://hjvjrxgnadzwmlydvnep.supabase.co";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getConfig() {
  return {
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ownerId: process.env.LOZIX_OWNER_PROFILE_ID,
    inviteCode: process.env.LOZIX_ADMIN_INVITE_CODE,
  };
}

async function supabaseRequest(path, serviceKey, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? payload.message || payload.details || payload.hint
        : null;
    throw new Error(message || `Supabase 요청 실패 (HTTP ${response.status})`);
  }
  return payload;
}

async function authenticate(body, serviceKey, ownerId) {
  const { profile_id, profile_name, profile_pin } = body || {};
  if (
    typeof profile_id !== "string" ||
    typeof profile_name !== "string" ||
    !/^\d{4,8}$/.test(String(profile_pin || ""))
  ) {
    throw new Error("프로필 인증 정보가 올바르지 않습니다.");
  }

  const loginResult = await supabaseRequest(
    "rpc/login_lozix_profile",
    serviceKey,
    {
      method: "POST",
      body: JSON.stringify({
        profile_name: profile_name.trim(),
        profile_pin: String(profile_pin),
      }),
    }
  );

  if (String(loginResult) !== profile_id) {
    throw new Error("프로필 이름 또는 PIN이 올바르지 않습니다.");
  }

  const profiles = await supabaseRequest(
    `lozix_profiles?id=eq.${encodeURIComponent(profile_id)}&select=id,name`,
    serviceKey
  );
  if (!Array.isArray(profiles) || profiles.length !== 1) {
    throw new Error("프로필을 찾을 수 없습니다.");
  }

  if (ownerId && profile_id === ownerId) return { id: profile_id, role: "owner" };

  const admins = await supabaseRequest(
    `lozix_admins?profile_id=eq.${encodeURIComponent(profile_id)}&select=profile_id`,
    serviceKey
  );
  return {
    id: profile_id,
    role: Array.isArray(admins) && admins.length > 0 ? "admin" : "user",
  };
}

async function getProfileRoles(serviceKey, ownerId) {
  const [profiles, admins] = await Promise.all([
    supabaseRequest(
      "lozix_profiles?select=id,name,created_at&order=created_at.asc",
      serviceKey
    ),
    supabaseRequest("lozix_admins?select=profile_id", serviceKey),
  ]);

  const adminIds = new Set(
    (Array.isArray(admins) ? admins : []).map((item) => item.profile_id)
  );

  return (Array.isArray(profiles) ? profiles : []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    created_at: profile.created_at,
    role:
      profile.id === ownerId
        ? "owner"
        : adminIds.has(profile.id)
          ? "admin"
          : "user",
  }));
}

async function writeAudit(serviceKey, actorId, targetId, action, targetName) {
  try {
    await supabaseRequest("lozix_admin_audit", serviceKey, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        actor_profile_id: actorId,
        target_profile_id: targetId || null,
        action,
        target_name: targetName || null,
      }),
    });
  } catch {
    // 감사 로그 실패가 관리자 작업 자체를 중단시키지는 않습니다.
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return json({ error: "POST 요청만 허용됩니다." }, 405);
    }

    const { serviceKey, ownerId, inviteCode } = getConfig();
    if (!serviceKey || !ownerId || !inviteCode) {
      return json({ error: "Vercel 관리자 환경 변수가 설정되지 않았습니다." }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
    }

    try {
      const actor = await authenticate(body, serviceKey, ownerId);
      const action = body.action;

      if (action === "status") {
        return json({ role: actor.role });
      }

      if (action === "claim_admin") {
        if (actor.role === "owner") {
          return json({ role: "owner", message: "최고 관리자입니다." });
        }
        if (typeof body.invite_code !== "string" || body.invite_code !== inviteCode) {
          return json({ error: "관리자 초대 코드가 올바르지 않습니다." }, 403);
        }

        await supabaseRequest("lozix_admins?on_conflict=profile_id", serviceKey, {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            profile_id: actor.id,
            granted_by: ownerId,
          }),
        });
        await writeAudit(serviceKey, actor.id, actor.id, "claim_admin", null);
        return json({ role: "admin", message: "관리자 권한이 부여되었습니다." });
      }

      if (action === "list") {
        if (actor.role !== "owner" && actor.role !== "admin") {
          return json({ error: "관리자 권한이 필요합니다." }, 403);
        }
        return json({ profiles: await getProfileRoles(serviceKey, ownerId) });
      }

      if (action === "delete_profile") {
        if (actor.role !== "owner" && actor.role !== "admin") {
          return json({ error: "관리자 권한이 필요합니다." }, 403);
        }
        const targetId = String(body.target_profile_id || "");
        if (!targetId || targetId === actor.id || targetId === ownerId) {
          return json({ error: "자신 또는 최고 관리자 프로필은 삭제할 수 없습니다." }, 403);
        }

        const allProfiles = await getProfileRoles(serviceKey, ownerId);
        const target = allProfiles.find((item) => item.id === targetId);
        if (!target) return json({ error: "대상 프로필을 찾을 수 없습니다." }, 404);
        if (actor.role === "admin" && target.role !== "user") {
          return json({ error: "일반 관리자는 다른 관리자 프로필을 삭제할 수 없습니다." }, 403);
        }

        await writeAudit(serviceKey, actor.id, target.id, "delete_profile", target.name);
        await supabaseRequest(
          `lozix_profiles?id=eq.${encodeURIComponent(target.id)}`,
          serviceKey,
          { method: "DELETE", headers: { Prefer: "return=minimal" } }
        );
        return json({ message: `${target.name} 프로필을 삭제했습니다.` });
      }

      if (action === "grant_admin" || action === "revoke_admin") {
        if (actor.role !== "owner") {
          return json({ error: "최고 관리자만 관리자 등급을 변경할 수 있습니다." }, 403);
        }
        const targetId = String(body.target_profile_id || "");
        if (!targetId || targetId === ownerId) {
          return json({ error: "최고 관리자 자신의 등급은 변경할 수 없습니다." }, 403);
        }

        const allProfiles = await getProfileRoles(serviceKey, ownerId);
        const target = allProfiles.find((item) => item.id === targetId);
        if (!target) return json({ error: "대상 프로필을 찾을 수 없습니다." }, 404);

        if (action === "grant_admin") {
          await supabaseRequest("lozix_admins?on_conflict=profile_id", serviceKey, {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({ profile_id: targetId, granted_by: actor.id }),
          });
        } else {
          await supabaseRequest(
            `lozix_admins?profile_id=eq.${encodeURIComponent(targetId)}`,
            serviceKey,
            { method: "DELETE", headers: { Prefer: "return=minimal" } }
          );
        }

        await writeAudit(serviceKey, actor.id, targetId, action, target.name);
        return json({
          message:
            action === "grant_admin"
              ? `${target.name}님에게 관리자 권한을 부여했습니다.`
              : `${target.name}님의 관리자 권한을 해제했습니다.`,
        });
      }

      return json({ error: "지원하지 않는 관리자 작업입니다." }, 400);
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "관리자 요청에 실패했습니다." },
        400
      );
    }
  },
};
