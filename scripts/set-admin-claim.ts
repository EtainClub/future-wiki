import { getAdminServices } from "../src/lib/firebase/admin";

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const identifier = args.find((arg) => !arg.startsWith("--"));
  if (!identifier) {
    throw new Error("사용법: npm run set:admin -- <email 또는 uid> [--revoke]");
  }

  const services = getAdminServices();
  if (!services) throw new Error("Firebase Admin 환경 변수가 필요합니다.");

  const user = identifier.includes("@")
    ? await services.auth.getUserByEmail(identifier)
    : await services.auth.getUser(identifier);

  const claims = { ...user.customClaims };
  delete claims.admin;
  await services.auth.setCustomUserClaims(user.uid, revoke ? claims : { ...claims, admin: true });

  // 기존 세션 쿠키는 verifySessionCookie(checkRevoked=true)로 검증되므로 권한 회수 시 즉시 무효화한다.
  if (revoke) await services.auth.revokeRefreshTokens(user.uid);

  console.log(`${user.email ?? user.uid}: admin=${revoke ? "false" : "true"} (uid ${user.uid})`);
  if (!revoke) console.log("브라우저에서 다시 로그인하면 새 ID 토큰에 claim이 실립니다.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
