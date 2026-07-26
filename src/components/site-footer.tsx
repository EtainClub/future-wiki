import { DISCLAIMER } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>{DISCLAIMER}</p>
      <p className="footer-meta">Git이 기록하고, 사람이 검토합니다.</p>
    </footer>
  );
}
