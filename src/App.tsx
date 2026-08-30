import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";


declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Tab = "calendar" | "timer" | "music" | "stats";

type MusicTrack = {
  title: string;
  artist: string;
  youtubeId: string;
};

const musicTracks: MusicTrack[] = [
  { title: "2002", artist: "Anne-Marie", youtubeId: "vZofi2hgiAE" },
  { title: "Oh yeah?", artist: "Steve Lacy", youtubeId: "hneQZu3VGCs" },
  { title: "Legends Never Die", artist: "Against The Current", youtubeId: "k8CAY6yqDdA" },
  { title: "Memories", artist: "Maroon 5", youtubeId: "SlPhMPnQ58k" },
  { title: "Stereo Hearts", artist: "Gym Class Heroes feat. Adam Levine", youtubeId: "odAToCo9Blg" },
  { title: "Someone You Loved", artist: "Lewis Capaldi", youtubeId: "6mTYd_CaUdE" },
  { title: "toxic till the end", artist: "ROSÉ", youtubeId: "wCFVFdhJdCo" },
  { title: "Beautiful Things", artist: "Benson Boone", youtubeId: "iqiQtNKX8M0" },
  { title: "Love Is Gone (Acoustic)", artist: "SLANDER", youtubeId: "34Tmi7gVzcE" },
  { title: "Dangerously", artist: "Charlie Puth", youtubeId: "3ERtNZqh1XA" },
  { title: "High Hopes", artist: "Panic! At The Disco", youtubeId: "0V3LwNtZxM4" },
  { title: "Unstoppable", artist: "Sia", youtubeId: "kIjUfXfJjGU" },
];

let youtubeApiPromise: Promise<any> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const existing = document.getElementById("youtube-iframe-api");
    const finish = () => resolve(window.YT);
    if (existing) {
      const check = window.setInterval(() => {
        if (window.YT?.Player) { window.clearInterval(check); finish(); }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      finish();
    };
  });
  return youtubeApiPromise;
}

function YouTubePlayer({ videoId, autoplay, onEnded }: { videoId: string; autoplay: boolean; onEnded: () => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current || !YT?.Player) return;
      playerRef.current?.destroy?.();
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        playerVars: { controls: 1, rel: 0, playsinline: 1, modestbranding: 1, autoplay: autoplay ? 1 : 0 },
        events: {
          onStateChange: (event: any) => {
            if (event.data === YT.PlayerState.ENDED) onEndedRef.current();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId]);

  useEffect(() => {
    if (!autoplay || !playerRef.current?.playVideo) return;
    playerRef.current.playVideo();
  }, [autoplay, videoId]);

  return <div ref={hostRef} className="youtube-player-host" />;
}


type StudyRecord = {
  id: string;
  date: string;
  name: string;
  start: string;
  end: string;
  seconds: number;
};

type Profile = { id: string; name: string };
type ActiveProfile = Profile & { pin: string };

const STORAGE_KEY = "study-app-v1-records";

const pad = (n: number) => String(n).padStart(2, "0");

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const formatDuration = (seconds: number) => {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toFixed(1).padStart(4, "0");
  return h > 0 ? `${h}시간 ${m}분 ${s}초` : `${m}분 ${s}초`;
};

const formatClock = (d: Date) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const formatStudyTime = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

const formatKoreanDate = (d: Date) =>
  `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;

const koreanWeekdays = ["일", "월", "화", "수", "목", "금", "토"];

const lunarNewYear = (year: number): [number, number, number] => {
  // Fixed lunar dates are handled by a compact lookup table for common calendar years.
  // Unknown future years fall back to no lunar holiday rather than displaying a wrong date.
  const table: Record<number, {seollal: string; buddha: string; chuseok: string}> = {
    2025:{seollal:"2025-01-29",buddha:"2025-05-05",chuseok:"2025-10-06"},
    2026:{seollal:"2026-02-17",buddha:"2026-05-24",chuseok:"2026-09-25"},
    2027:{seollal:"2027-02-07",buddha:"2027-05-13",chuseok:"2027-09-15"},
    2028:{seollal:"2028-01-27",buddha:"2028-05-02",chuseok:"2028-10-03"},
    2029:{seollal:"2029-02-13",buddha:"2029-05-20",chuseok:"2029-09-22"},
    2030:{seollal:"2030-02-03",buddha:"2030-05-09",chuseok:"2030-09-12"},
  };
  const x=table[year];
  return x ? [new Date(x.seollal).getMonth()+1,new Date(x.buddha).getMonth()+1,new Date(x.chuseok).getMonth()+1] : [0,0,0];
};

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: (Date | null)[] = [];

  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let day = 1; day <= last.getDate(); day++) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// 1차 버전에서는 대표적인 양력 공휴일을 우선 표시한다.
// 음력 공휴일은 이후 공공데이터/API 연동 단계에서 정확하게 확장한다.
const fixedHolidays = new Set(["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"]);

function holidayLabel(d: Date) {
  const key = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const labels: Record<string, string> = {
    "01-01": "신정",
    "03-01": "삼일절",
    "05-05": "어린이날",
    "06-06": "현충일",
    "08-15": "광복절",
    "10-03": "개천절",
    "10-09": "한글날",
    "12-25": "성탄절",
  };
  return labels[key] ?? "";
}

function loadRecords(): StudyRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}


// Korean public holidays + substitute holidays.
// The rules are based on the current "관공서의 공휴일에 관한 규정".
// Fixed-date holidays are calculated every year; lunar holidays are kept in a
// year table and can be extended when official lunar dates are published.
const HOLIDAY_NAMES: Record<string,string> = {
  "01-01":"신정", "03-01":"삼일절", "05-01":"근로자의 날",
  "05-05":"어린이날", "06-06":"현충일", "08-15":"광복절",
  "10-03":"개천절", "10-09":"한글날", "12-25":"성탄절"
};

const LUNAR_DATES: Record<number,{seollal:string;buddha:string;chuseok:string}> = {
  2025:{seollal:"2025-01-29",buddha:"2025-05-05",chuseok:"2025-10-06"},
  2026:{seollal:"2026-02-17",buddha:"2026-05-24",chuseok:"2026-09-25"},
  2027:{seollal:"2027-02-07",buddha:"2027-05-13",chuseok:"2027-09-15"},
  2028:{seollal:"2028-01-27",buddha:"2028-05-02",chuseok:"2028-10-03"},
  2029:{seollal:"2029-02-13",buddha:"2029-05-20",chuseok:"2029-09-22"},
  2030:{seollal:"2030-02-03",buddha:"2030-05-09",chuseok:"2030-09-12"},
  2031:{seollal:"2031-01-23",buddha:"2031-05-28",chuseok:"2031-09-30"},
  2032:{seollal:"2032-02-11",buddha:"2032-05-17",chuseok:"2032-09-18"},
  2033:{seollal:"2033-01-31",buddha:"2033-05-06",chuseok:"2033-09-08"},
  2034:{seollal:"2034-02-19",buddha:"2034-05-25",chuseok:"2034-09-27"},
  2035:{seollal:"2035-02-08",buddha:"2035-05-15",chuseok:"2035-09-16"},
  2036:{seollal:"2036-01-28",buddha:"2036-05-24",chuseok:"2036-10-03"},
};

function ymd(d:Date){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}

function buildKoreanHolidays(year:number){
  const result = new Map<string,string>();
  const add=(date:string,name:string)=>result.set(date,name);
  Object.entries(HOLIDAY_NAMES).forEach(([md,name])=>add(`${year}-${md}`,name));
  add(`${year}-05-01`,"근로자의 날");

  const lunar=LUNAR_DATES[year];
  if(lunar){
    const seollal=new Date(lunar.seollal+"T00:00:00");
    [-1,0,1].forEach(n=>{const d=new Date(seollal);d.setDate(d.getDate()+n);add(ymd(d),"설날");});
    add(lunar.buddha,"부처님 오신 날");
    const chuseok=new Date(lunar.chuseok+"T00:00:00");
    [-1,0,1].forEach(n=>{const d=new Date(chuseok);d.setDate(d.getDate()+n);add(ymd(d),"추석");});
  }

  // Current legal substitute-holiday rules:
  // March 1, Liberation Day, National Foundation Day, Hangul Day,
  // Buddha's Birthday, Labor Day, Children's Day, Christmas and
  // Seollal/Chuseok holiday periods receive substitutes according to the
  // regulation in force. We compute the first non-holiday day.
  const original = new Set(result.keys());
  const eligible = new Set<string>();
  for(const [date,name] of result){
    const d=new Date(date+"T00:00:00"), dow=d.getDay();
    // 대체공휴일은 법정 대체공휴일 대상일이 주말/겹친 공휴일과 겹칠 때만 만들고,
    // 대체 날짜 자체가 토·일요일이 되지 않도록 다음 평일까지 이동한다.
    if(["삼일절","광복절","개천절","한글날","부처님 오신 날","어린이날","성탄절"].includes(name) &&
       (dow===0 || dow===6)) eligible.add(date);
    if((name==="설날" || name==="추석") && (dow===0 || dow===6)) eligible.add(date);
  }
  for(const date of eligible){
    const d=new Date(date+"T00:00:00");
    do{d.setDate(d.getDate()+1);}while(original.has(ymd(d)) || d.getDay()===0 || d.getDay()===6);
    add(ymd(d),"대체공휴일");
  }
  return result;
}

function App() {
  const [tab, setTab] = useState<Tab>("calendar");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ActiveProfile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profilePin, setProfilePin] = useState("");
  const [profileMessage, setProfileMessage] = useState("프로필을 선택하거나 새로 만드세요.");
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const koreanHolidays = useMemo(() => buildKoreanHolidays(now.getFullYear()), [now]);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<"focus" | "break">("focus");
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [goals, setGoals] = useState<{id:string;date:string;name:string;targetSeconds:number}[]>(() => { try { return JSON.parse(localStorage.getItem("study-app-v1-goals") || "[]"); } catch { return []; } });
  const [goalName, setGoalName] = useState("");
  const [goalMinutes, setGoalMinutes] = useState("60");
  const [focusMinutes, setFocusMinutes] = useState("25");
  const [breakMinutes, setBreakMinutes] = useState("5");
  const [timerLengthDraft, setTimerLengthDraft] = useState("25");
  const [selectedChartDate, setSelectedChartDate] = useState<string | null>(null);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [autoplayTrack, setAutoplayTrack] = useState(false);
  const selectedTrackIndexRef = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, []);

  useEffect(() => {
    if (!activeProfile || !profileLoaded) return;
    const saveTimer = window.setTimeout(async () => {
      const { error } = await supabase.rpc("save_lozix_data", {
        profile_id: activeProfile.id,
        profile_pin: activeProfile.pin,
        next_records: records,
        next_goals: goals,
      });
      if (error) setProfileMessage("저장에 실패했습니다. 인터넷 연결을 확인하세요.");
    }, 700);
    return () => window.clearTimeout(saveTimer);
  }, [records, goals, activeProfile, profileLoaded]);

  useEffect(() => {
    if (!running || timerStartedAt === null) return;
    const id = window.setInterval(() => {
      const elapsed = pausedElapsed + (Date.now() - timerStartedAt) / 1000;
      setSessionElapsed(Number(elapsed.toFixed(1)));
    }, 100);
    return () => window.clearInterval(id);
  }, [running, timerStartedAt, pausedElapsed]);

  useEffect(() => {
    selectedTrackIndexRef.current = selectedTrackIndex;
  }, [selectedTrackIndex]);

  const calendarCells = useMemo(
    () => getMonthDays(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate]
  );

  const selectedRecords = records.filter((r) => r.date === selectedDate);

  const totalSeconds = records.reduce((sum, r) => sum + r.seconds, 0);

  async function refreshProfiles() {
    setProfilesLoading(true);
    const { data, error } = await supabase.rpc("list_lozix_profiles");
    if (error) setProfileMessage("서버 설정이 필요합니다. ZIP 안의 supabase-setup.sql을 먼저 실행하세요.");
    else setProfiles((data as Profile[]) ?? []);
    setProfilesLoading(false);
  }

  async function loadProfile(profile: Profile, pin: string) {
    setProfileMessage("프로필을 불러오는 중입니다…");
    setProfileLoaded(false);
    const { data, error } = await supabase.rpc("load_lozix_data", { profile_id: profile.id, profile_pin: pin });
    if (error) { setProfileMessage(error.message); return; }
    const saved = (data ?? {}) as { records?: StudyRecord[]; goals?: {id:string;date:string;name:string;targetSeconds:number}[] };
    setRecords(Array.isArray(saved.records) ? saved.records : []);
    setGoals(Array.isArray(saved.goals) ? saved.goals : []);
    setActiveProfile({ ...profile, pin });
    setProfileLoaded(true);
    setProfilePin("");
    setProfileMessage("");
  }

  async function openProfile() {
    const name = profileName.trim();
    if (!name || !/^\d{4}$/.test(profilePin)) { setProfileMessage("이름과 숫자 4자리 PIN을 입력하세요."); return; }
    setProfileMessage("PIN을 확인하는 중입니다…");
    const { data, error } = await supabase.rpc("login_lozix_profile", { profile_name: name, profile_pin: profilePin });
    if (error || !data) { setProfileMessage(error?.message ?? "이름 또는 PIN이 맞지 않습니다."); return; }
    await loadProfile({ id: data as string, name }, profilePin);
  }

  async function createProfile() {
    const name = profileName.trim();
    if (!name || !/^\d{4}$/.test(profilePin)) { setProfileMessage("이름과 숫자 4자리 PIN을 입력하세요."); return; }
    setProfileMessage("프로필을 만드는 중입니다…");
    const { data, error } = await supabase.rpc("create_lozix_profile", { profile_name: name, profile_pin: profilePin });
    if (error || !data) {
      const message = error?.message ?? "프로필을 만들 수 없습니다.";
      setProfileMessage(message.includes("create_lozix_profile") || message.includes("schema cache")
        ? "Supabase 프로필 함수가 아직 등록되지 않았습니다. 프로젝트의 supabase-fix.sql을 Supabase SQL Editor에서 한 번 실행해 주세요."
        : message);
      return;
    }
    const profile = { id: data as string, name };
    setProfiles(current => [...current, profile]);
    await loadProfile(profile, profilePin);
  }

  function logOutProfile() {
    setActiveProfile(null);
    setProfileLoaded(false);
    setRecords([]);
    setGoals([]);
    setProfilePin("");
    setProfileMessage("프로필을 선택하거나 새로 만드세요.");
    refreshProfiles();
  }

  function startTimer() { setTimerStartedAt(Date.now()); setRunning(true); }

  function pauseTimer() {
    if (timerStartedAt !== null) { const elapsed = Number((pausedElapsed + (Date.now() - timerStartedAt) / 1000).toFixed(1)); setPausedElapsed(elapsed); setSessionElapsed(elapsed); }
    setTimerStartedAt(null); setRunning(false);
  }

  function resetTimer() { setRunning(false); setTimerStartedAt(null); setPausedElapsed(0); setSessionElapsed(0); }
  function switchMode(mode: "focus" | "break") {
    setTimerMode(mode);
    setTimerLengthDraft(mode === "focus" ? String(focusMinutes) : String(breakMinutes));
    resetTimer();
  }
  function applyTimerLength() {
    const minutes = Math.max(1, Math.min(180, Number(timerLengthDraft) || 25));
    if (timerMode === "focus") setFocusMinutes(String(minutes));
    else setBreakMinutes(String(minutes));
    setTimerLengthDraft(String(minutes));
    resetTimer();
  }

  function saveSession() {
    if (sessionElapsed < 0.1 || timerMode !== "focus") return;
    const end = new Date(); const start = new Date(end.getTime() - sessionElapsed * 1000);
    const record: StudyRecord = { id: crypto.randomUUID(), date: dateKey(start), name: "공부", start: formatClock(start), end: formatClock(end), seconds: Number(sessionElapsed.toFixed(1)) };
    setRecords(prev => [record, ...prev]); setSelectedDate(record.date); resetTimer();
  }

  function addGoal() {
    const minutes = Number(goalMinutes);
    if (!goalName.trim() || !Number.isFinite(minutes) || minutes <= 0) return;
    setGoals(prev => [...prev, {id: crypto.randomUUID(), date: selectedDate, name: goalName.trim(), targetSeconds: minutes * 60}]);
    setGoalName("");
  }
  function goalStudied(goal: {date:string;name:string}) { return records.filter(r => r.date === goal.date && r.name.trim() === goal.name.trim()).reduce((sum,r)=>sum+r.seconds,0); }

  function updateRecordName(id: string, name: string) {
    setRecords((prev) =>
      prev.map((record) => (record.id === id ? { ...record, name } : record))
    );
  }

  function removeRecord(id: string) {
    setRecords((prev) => prev.filter((record) => record.id !== id));
  }

  function selectTrack(index: number) {
    selectedTrackIndexRef.current = index;
    setSelectedTrackIndex(index);
    setAutoplayTrack(true);
  }

  const currentMinutes = timerMode === "focus" ? focusMinutes : breakMinutes;
  const currentLength = currentMinutes * 60;
  const timerRemaining = Math.max(0, currentLength - sessionElapsed);
  const timerMin = Math.floor(timerRemaining / 60);
  const timerSec = Math.floor(timerRemaining % 60);
  const progress = Math.min(1, sessionElapsed / currentLength);

  if (!activeProfile) {
    return (
      <div className="profile-shell">
        <div className="profile-card">
          <div className="brand">LOZIX</div>
          <p className="eyebrow">YOUR STUDY PROFILE</p>
          <h1>프로필 선택</h1>
          <p className="profile-help">프로필마다 학습 기록과 목표가 따로 저장됩니다.</p>
          <div className="profile-list">
            {profilesLoading ? <span>프로필을 불러오는 중…</span> : profiles.length === 0 ? <span>아직 만들어진 프로필이 없습니다.</span> : profiles.map(profile => <button key={profile.id} className={profileName === profile.name ? "selected" : ""} onClick={() => { setProfileName(profile.name); setProfileMessage("숫자 4자리 PIN을 입력하세요."); }}>{profile.name}</button>)}
          </div>
          <div className="profile-form">
            <label>프로필 이름<input maxLength={24} value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="예: 민준" /></label>
            <label>4자리 PIN<input inputMode="numeric" type="password" maxLength={4} value={profilePin} onChange={e => setProfilePin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></label>
          </div>
          <p className="profile-message" role="status">{profileMessage}</p>
          <div className="profile-actions"><button className="secondary" onClick={openProfile}>프로필 열기</button><button className="primary" onClick={createProfile}>새 프로필 만들기</button></div>
          <p className="profile-footnote">최대 10개 · 이름과 PIN은 다른 기기에서도 사용할 수 있어요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">LOZIX</div>
          <div className="today-small">{formatKoreanDate(now)}</div>
        </div>
        <div className="topbar-actions"><span className="active-profile-name">{activeProfile.name}</span><button className="logout-button" onClick={logOutProfile}>프로필 변경</button><div className="live-clock">{formatClock(now)}</div></div>
      </header>

      <main className="content">
        {tab === "calendar" && (
          <section>
            <div className="page-heading">
              <div>
                <p className="eyebrow">CALENDAR</p>
                <h1>공부 캘린더</h1>
              </div>
              <div className="month-nav">
                <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>‹</button>
                <strong>{viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월</strong>
                <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>›</button>
              </div>
            </div>

            <div className="calendar-card">
              <div className="weekday-row">
                {koreanWeekdays.map((day, i) => (
                  <div key={day} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>{day}</div>
                ))}
              </div>
              <div className="calendar-grid">
                {calendarCells.map((d, i) => {
                  if (!d) return <div className="day empty" key={`empty-${i}`} />;
                  const key = dateKey(d);
                  const isToday = key === dateKey(now);
                  const isSelected = key === selectedDate;
                  const isHoliday = koreanHolidays.has(key);
                  const dayRecords = records.filter((r) => r.date === key);
                  const dayGoals = goals.filter((g) => g.date === key);
                  const dayGoalsCompleted = dayGoals.length > 0 && dayGoals.every((g) => goalStudied(g) >= g.targetSeconds);
                  const studied = dayRecords.reduce((sum, r) => sum + r.seconds, 0);
                  return (
                    <button
                      className={`day ${d.getDay() === 0 ? "sun" : ""} ${d.getDay() === 6 ? "sat" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                      key={key}
                      onClick={() => setSelectedDate(key)}
                    >
                      <span className="day-number">{d.getDate()}</span>
                      {isHoliday && <span className="holiday">{koreanHolidays.get(dateKey(d)) || ""}</span>}
                      {dayGoals.length > 0 && <span className="goal-badge">목표 {dayGoals.length}</span>}
                      {dayGoalsCompleted && <span className="goal-complete" title="오늘의 목표 달성">✓</span>}
                      {studied > 0 && <span className="study-dot">{Math.floor(studied / 60)}분</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="section-title">
              <div>
                <p className="eyebrow">SELECTED DAY</p>
                <h2>{selectedDate.replaceAll("-", ".")}</h2>
              </div>
              <button className="primary" onClick={() => setTab("timer")}>타이머에서 공부하기</button>
            </div>

            <div className="goal-card">
              <div className="card-heading"><div><p className="eyebrow">DAILY GOAL</p><h2>오늘의 목표</h2></div><span className="muted">{selectedDate}</span></div>
              <div className="goal-add"><input className="name-input" value={goalName} onChange={e=>setGoalName(e.target.value)} placeholder="이름을 설정하세요 (예: 영어 단어)" aria-label="목표 이름"/><input className="minutes-input" type="number" min="1" value={goalMinutes} onChange={e=>setGoalMinutes(e.target.value)}/><span className="unit">분</span><button className="primary" onClick={addGoal}>목표 추가</button></div>
              {goals.filter(g=>g.date===selectedDate).length===0 ? <div className="empty-state">이 날짜의 목표가 없습니다. 위에서 목표를 추가해보세요.</div> : goals.filter(g=>g.date===selectedDate).map(g=>{ const studied=goalStudied(g), pct=Math.min(100,studied/g.targetSeconds*100); return <div className="goal-row" key={g.id}><div className="goal-top"><input value={g.name} onChange={e=>setGoals(p=>p.map(x=>x.id===g.id?{...x,name:e.target.value}:x))}/><div className="goal-target"><input type="number" min="1" value={Math.round(g.targetSeconds/60)} onChange={e=>setGoals(p=>p.map(x=>x.id===g.id?{...x,targetSeconds:Math.max(60,Number(e.target.value)*60)}:x))}/><span>분 목표</span></div></div><div className="progress-track"><div className="progress-fill" style={{width:`${pct}%`}}/></div><div className="goal-bottom"><span>{formatDuration(studied)} / {formatDuration(g.targetSeconds)}</span><strong>{pct.toFixed(1)}%</strong><button className="text-button" onClick={()=>setGoals(p=>p.filter(x=>x.id!==g.id))}>삭제</button></div></div> })}
            </div>

            <div className="records-card">
              {selectedRecords.length === 0 ? (
                <div className="empty-state">이 날짜에 저장된 학습 기록이 없습니다.</div>
              ) : (
                selectedRecords.map((record) => (
                  <div className="record-row" key={record.id}>
                    <div className="record-icon">⌛</div>
                    <div className="record-main">
                      <input
                        className="name-input"
                        value={record.name}
                        onChange={(e) => updateRecordName(record.id, e.target.value)}
                        placeholder="이름을 설정하세요"
                        aria-label="학습 기록 이름"
                      />
                      <span>{record.start} → {record.end}</span>
                    </div>
                    <strong>{formatDuration(record.seconds)}</strong>
                    <button className="text-button" onClick={() => removeRecord(record.id)}>삭제</button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {tab === "timer" && (
          <section className="timer-page">
            <div className="timer-clock">{formatClock(now)}</div>
            <p className="eyebrow">POMODORO TIMER</p>
            <h1>집중해서 공부해보세요</h1>

            <div className="pomodoro-wrap"><div className={`pomodoro ${running ? "running" : ""}`} style={{ ["--progress" as string]: `${progress * 360}deg` }}>
              <div className="pomodoro-inner">
                <span>{timerMode === "focus" ? "집중" : "휴식"}</span>
                <strong>{pad(timerMin)}:{pad(timerSec)}</strong>
                <small>{running ? "집중 중" : "준비됨"}</small>
              </div>
              </div><div className="orbit-dot" /></div>

            <div className="mode-switch">
              <button className={timerMode === "focus" ? "active" : ""} onClick={() => switchMode("focus")}>집중 {focusMinutes}분</button>
              <button className={timerMode === "break" ? "active" : ""} onClick={() => switchMode("break")}>휴식 {breakMinutes}분</button>
            </div>
            <div className="timer-length-box">
              <div><strong>{timerMode === "focus" ? "집중 시간" : "휴식 시간"} 설정</strong><span>원하는 시간을 직접 설정하세요 · 1~180분</span></div>
              <div className="timer-length-control">
                <input type="number" min="1" max="180" value={timerLengthDraft} onChange={e=>setTimerLengthDraft(e.target.value)} />
                <span>분</span>
                <button className="secondary" onClick={applyTimerLength}>적용</button>
              </div>
            </div>

            <div className="timer-controls">
              {!running ? (
                <button className="primary big" onClick={startTimer}>시작</button>
              ) : (
                <button className="primary big" onClick={pauseTimer}>일시정지</button>
              )}
              <button className="secondary big" onClick={resetTimer}>초기화</button>
              <button className="secondary big" disabled={sessionElapsed < 0.1} onClick={saveSession}>학습 저장</button>
            </div>

            <div className="session-info">
              <span>이번 세션 학습 시간</span>
              <strong>{formatDuration(sessionElapsed)}</strong>
            </div>

            <div className="timer-note">
              타이머를 시작하면 시작 시각이 기록되고, 저장하면 날짜·시작 시각·종료 시각·학습 시간이 캘린더에 추가됩니다.
            </div>
          </section>
        )}

        {(() => {
          const track = musicTracks[selectedTrackIndex];
          return (
            <section className={`music-page ${tab === "music" ? "" : "music-background-player"}`} aria-hidden={tab !== "music"}>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">STUDY PLAYLIST</p>
                  <h1>음악</h1>
                </div>
                <span className="track-count">12곡</span>
              </div>

              <div className="music-player-card">
                <div className="now-playing">
                  <span className="playing-label">NOW PLAYING</span>
                  <h2>{track.title}</h2>
                  <p>{track.artist}</p>
                </div>
                <div className="youtube-frame">
                  <YouTubePlayer
                    videoId={track.youtubeId}
                    autoplay={autoplayTrack}
                    onEnded={() => {
                      const nextIndex = (selectedTrackIndexRef.current + 1) % musicTracks.length;
                      selectedTrackIndexRef.current = nextIndex;
                      setSelectedTrackIndex(nextIndex);
                      setAutoplayTrack(true);
                    }}
                  />
                </div>
                <div className="music-controls">
                  <span>🔊 음량과 재생은 YouTube 플레이어에서 조절할 수 있어.</span>
                </div>
                <p className="music-note">다른 탭으로 이동해도 음악은 계속 재생됩니다.</p>
              </div>

              <div className="playlist-card">
                <div className="playlist-heading">
                  <div><p className="eyebrow">MY PLAYLIST</p><h2>공부할 때 듣는 음악</h2></div>
                  <span>{selectedTrackIndex + 1} / {musicTracks.length}</span>
                </div>
                <div className="track-list">
                  {musicTracks.map((item, index) => (
                    <button
                      key={item.youtubeId}
                      className={`track-row ${index === selectedTrackIndex ? "active" : ""}`}
                      onClick={() => selectTrack(index)}
                      aria-label={`${item.artist} ${item.title} 재생`}
                    >
                      <span className="track-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="track-details"><strong>{item.title}</strong><small>{item.artist}</small></span>
                      <span className="track-play">{index === selectedTrackIndex ? "재생 중" : "▶"}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          );
        })()}

        {tab === "stats" && (
          <section>
            <div className="page-heading">
              <div>
                <p className="eyebrow">STATISTICS</p>
                <h1 className="stats-title">학습 통계</h1>
              </div>
            </div>

            <div className="stat-cards">
              <div><span>전체 학습</span><strong>{formatStudyTime(totalSeconds)}</strong></div>
              <div><span>학습 기록</span><strong>{records.length}회</strong></div>
              <div><span>오늘 학습</span><strong>{formatStudyTime(records.filter(r => r.date === dateKey(now)).reduce((s, r) => s + r.seconds, 0))}</strong></div>
            </div>

            <div className="chart-card">
              <h2>최근 7일</h2>
              <p className="chart-help">막대를 클릭하면 해당 날짜의 학습 시간이 표시됩니다.</p>
              <div className="bar-chart">
                {Array.from({ length: 7 }, (_, index) => {
                  const d = new Date(now);
                  d.setDate(now.getDate() - (6 - index));
                  const key = dateKey(d);
                  const seconds = records.filter(r => r.date === key).reduce((sum, r) => sum + r.seconds, 0);
                  const max = Math.max(...Array.from({ length: 7 }, (_, j) => {
                    const x = new Date(now);
                    x.setDate(now.getDate() - (6 - j));
                    return records.filter(r => r.date === dateKey(x)).reduce((sum, r) => sum + r.seconds, 0);
                  }), 1);
                  return (
                    <button className={`bar-item ${selectedChartDate === key ? "selected" : ""}`} key={key} onClick={() => setSelectedChartDate(key)}>
                      <div className="bar-wrap"><div className="bar" style={{ height: `${Math.max(4, seconds / max * 100)}%` }} /></div>
                      <span>{koreanWeekdays[d.getDay()]}</span>
                      <small>{formatStudyTime(seconds)}</small>
                    </button>
                  );
                })}
              </div>
              {selectedChartDate && (
                <div className="chart-detail">
                  <strong>{selectedChartDate.replaceAll("-", ".")} 학습 시간</strong>
                  <span>{formatStudyTime(records.filter(r => r.date === selectedChartDate).reduce((sum,r)=>sum+r.seconds,0))}</span>
                </div>
              )}
            </div>

            <div className="records-card">
              <h2>최근 학습 기록</h2>
              {records.length === 0 ? (
                <div className="empty-state">아직 저장된 학습 기록이 없습니다.</div>
              ) : (
                records.slice(0, 10).map((r) => (
                  <div className="record-row" key={r.id}>
                    <div className="record-icon">✓</div>
                    <div className="record-main">
                      <strong>{r.name}</strong>
                      <span>{r.date} · {r.start} → {r.end}</span>
                    </div>
                    <strong>{formatDuration(r.seconds)}</strong>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        <button className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}><span>▦</span>캘린더</button>
        <button className={tab === "timer" ? "active" : ""} onClick={() => setTab("timer")}><span>◷</span>타이머</button>
        <button className={tab === "music" ? "active" : ""} onClick={() => setTab("music")}><span>♫</span>음악</button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}><span>▥</span>통계</button>
      </nav>
    </div>
  );
}

export default App;
