import Link from "next/link";
import { login } from "./actions.js";

export default async function LoginPage({ searchParams }) {
  const { error } = await searchParams;
  return (
    <main className="stack">
      <div><p className="muted">Phase 0 인증 기준선</p><h1>로그인</h1></div>
      <form action={login} className="card stack">
        <input type="email" name="email" placeholder="이메일" required />
        <input type="password" name="password" placeholder="비밀번호" required />
        {error ? <p role="alert">로그인 정보를 확인해 주세요.</p> : null}
        <button type="submit">로그인</button>
      </form>
      <Link href="/">돌아가기</Link>
    </main>
  );
}
