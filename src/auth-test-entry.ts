/**
 * 메인 React 앱과 분리된 Firebase Google 로그인 스모크 테스트.
 * 실행: npm run dev → /healthhealth/auth-test.html (또는 로컬 base에 맞는 경로)
 */
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";

const logEl = document.getElementById("log");
function log(msg: string, data?: unknown) {
  if (!logEl) return;
  const time = new Date().toISOString();
  const extra =
    data !== undefined
      ? `\n${typeof data === "string" ? data : JSON.stringify(data, replacer, 2)}`
      : "";
  const block = document.createElement("div");
  block.textContent = `[${time}] ${msg}${extra}`;
  block.style.marginBottom = "10px";
  block.style.borderBottom = "1px solid #1e293b";
  block.style.paddingBottom = "8px";
  logEl.appendChild(block);
  logEl.scrollTop = logEl.scrollHeight;
}

function replacer(_k: string, v: unknown) {
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
  return v;
}

/** FirebaseAuthError 등 */
function formatAuthErr(e: unknown) {
  const o = e as { code?: string; message?: string; customData?: Record<string, unknown> };
  return {
    code: o?.code ?? "(no code)",
    message: o?.message ?? String(e),
    customData: o?.customData,
  };
}

function maskKey(k: string | undefined) {
  if (!k) return "(empty)";
  if (k.length <= 8) return "***";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

function isConfigured(): boolean {
  return !!(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  );
}

async function main() {
  if (!isConfigured()) {
    log("VITE_FIREBASE_* 가 비어 있습니다. 프로젝트 루트 .env 를 확인하세요.");
    return;
  }

  log("환경 (Firebase 콘솔 승인 도메인에 아래 origin 이 있어야 함)", {
    origin: typeof location !== "undefined" ? location.origin : "?",
    pathname: typeof location !== "undefined" ? location.pathname : "?",
    hasUrlQuery: typeof location !== "undefined" && location.search.length > 0,
    note: "리다이렉트 로그인 후 돌아오면 URL에 쿼리가 잠깐 붙을 수 있음(전체 URL은 공유하지 마세요)",
  });

  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);

  log("Firebase 설정 요약(비밀 아님: apiKey 일부만)", {
    apiKey: maskKey(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });

  try {
    await setPersistence(auth, browserLocalPersistence);
    log("setPersistence(browserLocalPersistence) OK");
  } catch (e) {
    log("setPersistence 실패 (무시 가능)", e);
  }

  try {
    const redirect = await getRedirectResult(auth);
    if (redirect?.user) {
      log("getRedirectResult: 로그인됨", {
        uid: redirect.user.uid,
        email: redirect.user.email,
        displayName: redirect.user.displayName,
      });
    } else {
      log("getRedirectResult: 결과 없음 (정상 — 리다이렉트 직후가 아니면 null)");
    }
  } catch (e) {
    log("getRedirectResult 오류", e);
  }

  await auth.authStateReady();
  log("authStateReady 직후 currentUser", summarizeUser(auth.currentUser));

  let lastUid: string | null | undefined;
  onAuthStateChanged(auth, (u) => {
    const id = u?.uid ?? null;
    if (lastUid === undefined) {
      lastUid = id;
      log("onAuthStateChanged [초기]", summarizeUser(u));
      return;
    }
    if (lastUid === id) return;
    lastUid = id;
    log("onAuthStateChanged [사용자 변경]", summarizeUser(u));
  });

  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");

  document.getElementById("btn-popup")?.addEventListener("click", async () => {
    log("[팝업] 버튼 클릭 — 곧 Google 팝업이 떠야 합니다. 안 뜨면 브라우저 팝업 차단을 확인하세요.");
    try {
      const r = await signInWithPopup(auth, provider);
      log("signInWithPopup 성공", summarizeUser(r.user));
      log("팝업 직후 auth.currentUser", summarizeUser(auth.currentUser));
      for (let i = 1; i <= 6; i++) {
        window.setTimeout(() => {
          log(`팝업 성공 후 +${i * 500}ms currentUser`, summarizeUser(auth.currentUser));
        }, i * 500);
      }
    } catch (e) {
      log("signInWithPopup 실패", formatAuthErr(e));
    }
  });

  document.getElementById("btn-redirect")?.addEventListener("click", async () => {
    log("[리다이렉트] 버튼 클릭 — 잠시 후 이 탭이 Google 로 이동합니다");
    try {
      await signInWithRedirect(auth, provider);
    } catch (e) {
      log("signInWithRedirect 실패", formatAuthErr(e));
    }
  });

  document.getElementById("btn-out")?.addEventListener("click", async () => {
    log("[로그아웃] 버튼 클릭");
    try {
      await signOut(auth);
      log("signOut 완료 (로그인 안 된 상태에서 눌러도 여기까지 올 수 있음)");
    } catch (e) {
      log("signOut 실패", formatAuthErr(e));
    }
  });

  document.getElementById("btn-refresh")?.addEventListener("click", () => {
    log("수동: auth.currentUser", summarizeUser(auth.currentUser));
  });
}

function summarizeUser(u: import("firebase/auth").User | null) {
  if (!u) return null;
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    isAnonymous: u.isAnonymous,
  };
}

void main().catch((e) => log("main() 예외", e));
