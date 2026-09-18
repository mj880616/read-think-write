import { supabase } from './supabase.js';
import { keepGoogleIdentityOnly, signInWithGoogle } from './auth-oauth.js';
import * as api from './api.js';

let identityCleanupAttemptedFor = null;

function addGoogleLoginButton() {
  const login = document.querySelector('.login');
  if (!login) return;

  const form = login.querySelector('#login-form');
  form?.remove();

  if (login.querySelector('#google-login')) return;

  const wrap = document.createElement('div');
  wrap.className = 'form';
  wrap.innerHTML = `
    <button type="button" class="btn" id="google-login" style="width:100%">Google로 로그인</button>
    <div class="status" id="login-status"></div>
  `;
  login.append(wrap);

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

async function cleanOwnerIdentity(userId) {
  if (identityCleanupAttemptedFor === userId) return;
  identityCleanupAttemptedFor = userId;
  try {
    await keepGoogleIdentityOnly();
  } catch (error) {
    console.error('Email identity cleanup failed', error);
  }
}

async function prepareSignedInUser() {
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    identityCleanupAttemptedFor = null;
    addGoogleLoginButton();
    return;
  }
  await cleanOwnerIdentity(user.id);
}

const observer = new MutationObserver(() => {
  addGoogleLoginButton();
  prepareSignedInUser();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

supabase.auth.onAuthStateChange(() => {
  lastCheckedUserId = null;
  queueMicrotask(prepareSignedInUser);
});

addGoogleLoginButton();
prepareSignedInUser();
