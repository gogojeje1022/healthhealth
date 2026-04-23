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

  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);

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

  onAuthStateChanged(auth, (u) => {
    log("onAuthStateChanged", summarizeUser(u));
  });

  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");

  document.getElementById("btn-popup")?.addEventListener("click", async () => {
    try {
      const r = await signInWithPopup(auth, provider);
      log("signInWithPopup 성공", summarizeUser(r.user));
      log("팝업 직후 auth.currentUser", summarizeUser(auth.currentUser));
    } catch (e) {
      log("signInWithPopup 실패", e);
    }
  });

  document.getElementById("btn-redirect")?.addEventListener("click", async () => {
    try {
      log("signInWithRedirect 시작 — 페이지가 Google 로 이동합니다");
      await signInWithRedirect(auth, provider);
    } catch (e) {
      log("signInWithRedirect 실패", e);
    }
  });

  document.getElementById("btn-out")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      log("signOut 완료");
    } catch (e) {
      log("signOut 실패", e);
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
