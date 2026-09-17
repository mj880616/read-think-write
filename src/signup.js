import * as api from './api.js';
import { validateSignupInput } from './model.js';

function buildSignupPanel() {
  const wrapper = document.createElement('div');
  wrapper.className = 'signup-box';
  wrapper.innerHTML = `
    <div class="auth-divider">처음 사용하는 경우</div>
    <button type="button" class="btn secondary" id="signup-toggle">회원가입</button>
    <form id="signup-form" class="form" hidden>
      <div class="field"><label>이메일</label><input name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label>비밀번호 확인</label><input name="password_confirm" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn">계정 만들기</button>
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
    const email = data.get('email');
    const password = data.get('password');
    const passwordConfirm = data.get('password_confirm');
    const validation = validateSignupInput(email, password, passwordConfirm);

    if (!validation.ok) {
      status.textContent = validation.message;
      status.classList.add('error');
      return;
    }

    status.textContent = '계정을 만드는 중…';
    try {
      const result = await api.signUp(String(email).trim(), String(password));
      if (result.session) {
        status.textContent = '회원가입 완료. 로그인 상태로 전환합니다.';
        location.reload();
        return;
      }
      status.textContent = '회원가입 요청이 완료되었습니다. 이메일 확인 메일이 왔다면 확인 링크를 누른 뒤 이 페이지에서 로그인해 주세요.';
      form.reset();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  });
}

const observer = new MutationObserver(enhanceLogin);
observer.observe(document.documentElement, { childList: true, subtree: true });
enhanceLogin();
