const fs = require("fs");
const { google } = require("googleapis");

// ─────────────────────────────────────────────────────────────
//  Google OAuth2 — reads credentials.json and token.json
//  On first run (no token.json), prints a URL for user to visit.
//  After pasting the code, token.json is written for future runs.
// ─────────────────────────────────────────────────────────────

const SCOPES     = ["https://www.googleapis.com/auth/drive.file"];
const TOKEN_PATH = "token.json";

async function authorize() {
  return new Promise((resolve, reject) => {
    fs.readFile("credentials.json", (err, content) => {
      if (err) {
        console.error(
          "❌  credentials.json not found.\n" +
          "    Download it from Google Cloud Console → APIs & Services → Credentials\n" +
          "    and place it in the backend/ folder."
        );
        return reject(err);
      }
      authorizeClient(JSON.parse(content), resolve, reject);
    });
  });
}

function authorizeClient(credentials, resolve, reject) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, resolve, reject);
    oAuth2Client.setCredentials(JSON.parse(token));
    resolve(oAuth2Client);
  });
}

function getAccessToken(oAuth2Client, resolve, reject) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("\n🔐  Authorize this app by visiting:\n   ", authUrl);

  // Interactive prompt for first-time setup
  const readline = require("readline");
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });
  rl.question("\nEnter the authorization code from the page: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error("Error retrieving access token:", err);
        return reject(err);
      }
      oAuth2Client.setCredentials(token);
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (writeErr) => {
        if (writeErr) console.error(writeErr);
        else console.log("✅  Token stored to", TOKEN_PATH);
      });
      resolve(oAuth2Client);
    });
  });
}

module.exports = { authorize };
