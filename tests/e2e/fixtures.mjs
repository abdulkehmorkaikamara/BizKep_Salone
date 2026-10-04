// Shared between the seed server and the tests.
export const PORT = 8799;
export const BASE_URL = `http://localhost:${PORT}`;

// One main session per role, plus a spare that the sign-out tests can destroy.
export const SESSIONS = {
  owner: { userId: "u-owner", token: "e2e-owner-session-token" },
  manager: { userId: "u-manager", token: "e2e-manager-session-token" },
  attendant: { userId: "u-attendant", token: "e2e-attendant-session-token" },
  ownerLogout: { userId: "u-owner", token: "e2e-owner-logout-token" },
  managerLogout: { userId: "u-manager", token: "e2e-manager-logout-token" },
  attendantLogout: { userId: "u-attendant", token: "e2e-attendant-logout-token" }
};
