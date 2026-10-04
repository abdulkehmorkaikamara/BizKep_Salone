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
  attendantLogout: { userId: "u-attendant", token: "e2e-attendant-logout-token" },
  // Signed out by the password-reset test.
  resetStaff: { userId: "u-reset", token: "e2e-reset-staff-token" },
  // Account-deletion tests: a staff member who deletes their account, one who
  // can't yet because their shift is open, and the Owner of a second business
  // who deletes it. These have real passwords (ACCOUNT_PASSWORD).
  leaver: { userId: "u-leaver", token: "e2e-leaver-token" },
  shiftHolder: { userId: "u-shift-holder", token: "e2e-shift-holder-token" },
  closer: { userId: "u-closer", token: "e2e-closer-token" },
  closerStaff: { userId: "u-closer-staff", token: "e2e-closer-staff-token" }
};
export const ACCOUNT_PASSWORD = "correct horse battery";
export const BOOTSTRAP_TOKEN = "e2e-bootstrap-token-that-is-at-least-32-chars";
