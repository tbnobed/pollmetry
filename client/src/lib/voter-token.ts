import { v4 as uuidv4 } from "uuid";

const VOTER_TOKEN_KEY = "voter_token";

export function getVoterToken(): string {
  let token = localStorage.getItem(VOTER_TOKEN_KEY);
  if (!token) {
    token = uuidv4();
    localStorage.setItem(VOTER_TOKEN_KEY, token);
  }
  return token;
}

export function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
