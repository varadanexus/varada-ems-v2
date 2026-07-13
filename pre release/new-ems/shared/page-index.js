import { ROUTES } from "../config/constants.js";
import { redirectIfAuthenticated } from "./auth.js";

async function init() {
  const goDashboard = await redirectIfAuthenticated();
  if (!goDashboard) {
    window.location.replace(ROUTES.LOGIN);
  }
}

init();
