import "./globals.css";
import "./candidate-review.css";
import "./idea-review.css";
import "./saved-problems.css";

export const metadata = {
  title: "어노잉 레이더",
  description: "근거 기반 문제 발굴 엔진",
};

export default function RootLayout({ children }) {
  return <html lang="ko"><body>{children}</body></html>;
}
