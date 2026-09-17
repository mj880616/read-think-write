import * as api from './api.js';
import { validateSignupInput } from './model.js';

function buildSignupPanel() {
  const wrapper = document.createElement('div');
  wrapper.className = 'signup-box';
  wrapper.innerHTML = `
    <div class="auth-divider">처음 사용하는 경우</div>
    <button type="button" class="btn secondary" id="signup-toggle">회원가입</button>
    <form id="signup-form" class="form" hidden>
      <p class="muted">이 사이트는 개인용이라 최초 1회만 계정을 만들 수 있습니다. 확인 메일 대신 초기 설정 코드를 사용합니다.</p>
      <div class="field"><label>초기 설정 코드</label><input name="setup_code" autocomplete="off" required></div>
      <div class="field"><label>이메일</label><input name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label>비밀번호 확인</label><input name="password_confirm" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn">계정 만들고 로그인</button>
      <div class="status" id="signup-status"></div>
    </form>
  `;
  return wrapper;
}

function enhanceLogin() {
  const login = document.querySelector('.login');
  if (!login || login.querySelector('#signup-toggle')) return;

  const panel = buildSignupPanel();
  login.append(panel);

  const toggle = panel.querySelector('#signup-toggle');
  const form = panel.querySelector('#signup-form');
  const status = panel.querySelector('#signup-status');

  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    toggle.textContent = form.hidden ? '회원가입' : '회원가입 닫기';
    status.textContent = '';
    status.classList.remove('error');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.classList.remove('error');

    const data = new FormData(form);
    const setupCode = String(data.get('setup_code') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const passwordConfirm = String(data.get('password_confirm') ?? '');
    const validation = validateSignupInput(email, password, passwordConfirm);

    if (!setupCode) {
      status.textContent = '초기 설정 코드를 입력해 주세요.';
      status.classList.add('error');
      return;
    }

    if (!validation.ok) {
      status.textContent = validation.message;
      status.classList.add('error');
      return;
    }

    status.textContent = '계정을 만들고 기존 읽기 자료를 연결하는 중…';
    try {
      await api.setupOwner(email, password, setupCode);
      await api.signIn(email, password);
      status.textContent = '설정 완료. 앞으로 30일 동안 재로그인을 요구하지 않습니다.';
      location.reload();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}

const observer = new MutationObserver(enhanceLogin);
observer.observe(document.documentElement, { childList: true, subtree: true });
enhanceLogin();
