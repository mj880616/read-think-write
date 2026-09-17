import { signIn, signInWithGoogle } from '../runtime/auth.js';
import { navigate } from '../router.js';

export function renderLogin(root) {
  root.innerHTML = `
    <div class="login-page">
      <section class="login-card">
        <p class="eyebrow">개인 사고 저장소</p>
        <h1>읽고 생각하고 쓰기</h1>
        <p class="muted">읽은 글과 메모를 쌓고, 주제와 질문으로 다시 연결합니다.</p>
        <form id="loginForm" class="stack-form">
          <label>이메일<input name="email" type="email" autocomplete="email" required></label>
          <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
          <button class="primary-button" type="submit">로그인</button>
          <p id="loginStatus" class="status-line" aria-live="polite"></p>
        </form>
        <button id="googleLogin" class="secondary-button" type="button">Google로 로그인</button>
      </section>
    </div>`;
  const form = root.querySelector('#loginForm');
  const status = root.querySelector('#loginStatus');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    status.textContent = '로그인 중…';
    const fd = new FormData(form);
    try {
      await signIn(fd.get('email'), fd.get('password'));
      status.textContent = '로그인 완료';
      navigate('/', { replace: true });
    } catch (err) {
      status.textContent = err.message || '로그인에 실패했습니다.';
    }
  });
  root.querySelector('#googleLogin').addEventListener('click', () => signInWithGoogle().catch(err => { status.textContent = err.message; }));
}
