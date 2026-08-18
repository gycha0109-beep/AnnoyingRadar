import Link from "next/link";
import { login } from "./actions.js";

export default async function LoginPage({ searchParams }) {
  const { error } = await searchParams;
  return (
    <main className="stack landing-shell">
      <div className="stack-sm">
        <p className="eyebrow">Annoying Radar</p>
        <h1>로그인</h1>
        <p className="hero-copy">저장한 문제와 개인 Research Workspace에 접근합니다.</p>
      </div>
      <form action={login} className="card stack">
        <input type="email" name="email" placeholder="이메일" required />
        <input type="password" name="password" placeholder="비밀번호" required />
        {error ? <p role="alert">로그인 정보를 확인해 주세요.</p> : null}
        <button type="submit">로그인</button>
      </form>
      <Link href="/">Public Radar로 돌아가기</Link>
    </main>
  );
}
