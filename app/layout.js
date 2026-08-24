import "./globals.css";
import "./candidate-review.css";
import "./idea-review.css";
import "./idea-board.css";
import "./saved-problems.css";
import "./research-projects.css";
import "./radar.css";
import "./curator.css";
import "./source-lab.css";
import "./source-audit.css";

export const metadata = {
  title: "어노잉 레이더",
  description: "공개 사용자 의견 속에서 반복되는 문제를 근거와 함께 발견하는 Problem Discovery Radar",
};

export default function RootLayout({ children }) {
  return <html lang="ko"><body>{children}</body></html>;
}
