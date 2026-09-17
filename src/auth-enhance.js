import { supabase } from './supabase.js';
import { claimOwner, ownerSetupStatus, signInWithGoogle } from './auth-oauth.js';
import * as api from './api.js';

let checkingOwner = false;
let lastCheckedUserId = null;

function addGoogleLoginButton() {
  const login = document.querySelector('.login');
  if (!login || login.querySelector('#google-login')) return;

  const form = login.querySelector('#login-form');
  if (!form) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button type="button" class="btn secondary" id="google-login" style="width:100%;margin:0 0 14px">Google로 로그인</button>
    <div class="auth-divider">또는 이메일로 로그인</div>
  `;
  login.insertBefore(wrap, form);

  wrap.querySelector('#google-login').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Google 로그인으로 이동 중…';
    try {
      await signInWithGoogle();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Google로 로그인';
      const status = login.querySelector('#login-status');
      if (status) {
        status.textContent = error.message;
        status.classList.add('error');
      }
    }
  });
}

function renderOwnerClaim(user) {
  const root = document.querySelector('#app');
  if (!root || document.querySelector('#owner-claim-form')) return;

  root.innerHTML = `<div class="shell login-wrap">
    <section class="login">
      <div class="eyebrow">최초 1회 설정</div>
      <h1>내 기록 저장소 연결</h1>
      <p class="muted">Google 로그인은 완료되었습니다. 기존 읽기 자료와 메모 저장소를 이 계정에 연결하려면 초기 설정 코드만 한 번 입력하세요.</p>
      <div class="meta" style="margin-bottom:18px">${user.email ?? ''}</div>
      <form id="owner-claim-form" class="form">
        <div class="field"><label>초기 설정 코드</label><input name="setup_code" autocomplete="off" required></div>
        <button class="btn">내 계정에 연결</button>
        <div class="status" id="owner-claim-status"></div>
      </form>
      <button type="button" class="btn secondary" id="owner-claim-logout" style="margin-top:12px">다른 계정으로 로그인</button>
    </section>
  </div>`;

  document.querySelector('#owner-claim-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#owner-claim-status');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const setupCode = new FormData(event.currentTarget).get('setup_code');
    status.textContent = '기존 기록을 연결하는 중…';
    status.classList.remove('error');
    button.disabled = true;
    try {
      await claimOwner(setupCode);
      status.textContent = '연결 완료. 기록을 불러옵니다.';
      location.reload();
    } catch (error) {
      button.disabled = false;
      status.textContent = error.message;
      status.classList.add('error');
    }
  });

  document.querySelector('#owner-claim-logout').addEventListener('click', async () => {
    await api.signOut();
    location.reload();
  });
}

function renderNotOwner() {
  const root = document.querySelector('#app');
  if (!root || document.querySelector('#not-owner-logout')) return;
  root.innerHTML = `<div class="shell login-wrap">
    <section class="login">
      <div class="eyebrow">개인 저장소</div>
      <h1>다른 계정으로 로그인 필요</h1>
      <p class="muted">이 저장소는 최초 설정한 한 계정에만 연결됩니다.</p>
      <button type="button" class="btn secondary" id="not-owner-logout">로그아웃</button>
    </section>
  </div>`;
  document.querySelector('#not-owner-logout').addEventListener('click', async () => {
    await api.signOut();
    location.reload();
  });
}

async function checkOwner() {
  if (checkingOwner) return;
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    lastCheckedUserId = null;
    addGoogleLoginButton();
    return;
  }
  if (lastCheckedUserId === user.id) return;

  checkingOwner = true;
  try {
    const status = await ownerSetupStatus();
    lastCheckedUserId = user.id;
    if (status === 'unclaimed') renderOwnerClaim(user);
    else if (status === 'not-owner') renderNotOwner();
  } catch (error) {
    console.error('Owner status check failed', error);
  } finally {
    checkingOwner = false;
  }
}

const observer = new MutationObserver(() => {
  addGoogleLoginButton();
  checkOwner();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

supabase.auth.onAuthStateChange(() => {
  lastCheckedUserId = null;
  queueMicrotask(checkOwner);
});

addGoogleLoginButton();
checkOwner();
